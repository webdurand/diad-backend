import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { DiceService } from './dice.service';
import { ConditionEffectsService } from './condition-effects.service';
import { EventService } from './event.service';
import { InspirationService } from './inspiration.service';
import { ExhaustionService } from './exhaustion.service';
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from '../interfaces/result.type';
import { SavingThrowResult } from '../interfaces/combat.interfaces';
import { AdvantageResult } from '../interfaces/dice.interfaces';

// --- DTOs ---

export interface SavingThrowDto {
  characterId: string;
  userId: string;
  ability: string;
  dc: number;
  advantage?: boolean;
  disadvantage?: boolean;
  sessionId?: string;
  encounterId?: string;
  /**
   * Spec 012 — se informado, leitura+consumo de `inspirationArmed` do
   * participant adiciona advantage + zera flag encounter e ficha. Only
   * applies quando caller conhece o participant (caminho combate/encounter).
   */
  participantId?: string;
}

@Injectable()
export class SavingThrowService {
  constructor(
    private readonly sheetService: CharacterSheetService,
    private readonly diceService: DiceService,
    private readonly conditionEffects: ConditionEffectsService,
    private readonly eventService: EventService,
    private readonly inspirationService: InspirationService,
    private readonly exhaustionService: ExhaustionService,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
  ) {}

  async rollSavingThrow(dto: SavingThrowDto): Promise<GameResult<SavingThrowResult>> {
    const sheet = await this.sheetService.computeSheet(dto.userId, dto.characterId);
    if (!sheet) {
      return failure('Personagem nao encontrado.', 'INVALID_PARTICIPANT');
    }

    // Find saving throw bonus from computed sheet
    const saveBlock = sheet.savingThrows.find(
      (s) => s.slug === dto.ability || s.name.toLowerCase() === dto.ability.toLowerCase(),
    );
    if (!saveBlock) {
      return failure(`Ability '${dto.ability}' nao encontrada.`, 'INVALID_ACTION');
    }

    const modifier = saveBlock.bonus;

    // Check condition effects on saving throws
    const conditions = sheet.conditions ?? [];
    const condMods = this.conditionEffects.getSavingThrowModifiers(conditions, dto.ability);

    if (condMods.autoFail) {
      const result: SavingThrowResult = {
        ability: dto.ability,
        dc: dto.dc,
        roll: 0,
        modifier,
        total: 0,
        success: false,
      };
      return success(result, this.buildEvents(dto, 0, modifier, 0, false));
    }

    // Determine advantage/disadvantage
    let hasAdvantage = dto.advantage ?? false;
    let hasDisadvantage = dto.disadvantage ?? false;

    if (condMods.hasAdvantage) hasAdvantage = true;
    if (condMods.hasDisadvantage) hasDisadvantage = true;

    // Spec 012 — Heroic Inspiration: se armed, consome e aplica advantage.
    let inspirationEvent: GameEventData | null = null;
    if (dto.participantId) {
      const inspResult = await this.inspirationService.consumeIfArmed(
        dto.participantId,
        'saving_throw',
      );
      if (inspResult.consumed && inspResult.eventData) {
        hasAdvantage = true;
        inspirationEvent = inspResult.eventData;
      }
    }

    // Roll the d20
    let roll: number;
    let advantageResult: AdvantageResult | undefined;

    if (hasAdvantage && !hasDisadvantage) {
      const r = this.diceService.rollWithAdvantage();
      roll = r.chosen;
      advantageResult = { roll1: r.roll1, roll2: r.roll2, chosen: r.chosen, discarded: r.roll1 === r.chosen ? r.roll2 : r.roll1 };
    } else if (hasDisadvantage && !hasAdvantage) {
      const r = this.diceService.rollWithDisadvantage();
      roll = r.chosen;
      advantageResult = { roll1: r.roll1, roll2: r.roll2, chosen: r.chosen, discarded: r.roll1 === r.chosen ? r.roll2 : r.roll1 };
    } else {
      roll = this.diceService.roll(20);
    }

    // Spec 012 Paladin — Aura of Protection L6 (+CHA save em aliados 10ft) +
    // Aura Expansion L18 (10 → 30ft). Busca PC ally Paladin L6+ com flag
    // hasAuraOfProtection dentro de 10/30ft do subject. Usa maior CHA mod.
    let auraBonus = 0;
    let auraSourceName: string | null = null;
    if (dto.participantId) {
      const auraResult = await this.computeAuraOfProtectionBonus(
        dto.participantId,
        dto.userId,
      );
      auraBonus = auraResult.bonus;
      auraSourceName = auraResult.sourceName;
    }

    // Spec 004/012 — somar save_bonus/save_penalty dos EffectInstance do participant
    // (Bless +1d4, Bane -1d4). Só quando conhecemos o participant.
    let effectBonusSum = 0;
    const rolledEffectBonuses: Array<{ source: string; dice?: string; rolled: number }> = [];
    if (dto.participantId) {
      const subject = await this.participantRepo.findOne({ where: { id: dto.participantId } });
      for (const e of subject?.effectInstances ?? []) {
        if (e.kind === 'save_bonus' && e.payload?.diceExpression) {
          const r = this.diceService.rollExpression(e.payload.diceExpression);
          rolledEffectBonuses.push({ source: e.sourceSpellSlug ?? 'effect', dice: e.payload.diceExpression, rolled: r.total });
          effectBonusSum += r.total;
        } else if (e.kind === 'save_penalty' && e.payload?.diceExpression) {
          const r = this.diceService.rollExpression(e.payload.diceExpression);
          rolledEffectBonuses.push({ source: e.sourceSpellSlug ?? 'effect', dice: `-${e.payload.diceExpression}`, rolled: -r.total });
          effectBonusSum += -r.total;
        }
      }
    }

    // Spec 012 Lote B — Exhaustion XPHB 2024: -2×level em saving throws (flat).
    const exhLevel = (sheet as { exhaustionLevel?: number }).exhaustionLevel ?? 0;
    const exhMods = exhLevel > 0
      ? this.exhaustionService.getModifiers(exhLevel, '2024_ten_levels')
      : null;
    const exhaustionD20Penalty = exhMods?.d20Penalty ?? 0;

    let total = roll + modifier + auraBonus + effectBonusSum + exhaustionD20Penalty;
    let passed = total >= dto.dc;

    // Fighter L9 Indomitable (RAW 2024) — se save falhou e o participant armou
    // Indomitable, rerola d20 + bonus fighter level. Novo resultado substitui.
    let indomitableEvent: GameEventData | null = null;
    let indomitableReroll: { originalRoll: number; newRoll: number; fighterLevel: number } | undefined;
    if (!passed && dto.participantId) {
      const indomitable = await this.consumeIndomitableIfArmed(
        dto.participantId,
        sheet,
      );
      if (indomitable) {
        const newRoll = this.diceService.roll(20);
        const newTotal = newRoll + modifier + indomitable.fighterLevel;
        const newPassed = newTotal >= dto.dc;
        indomitableReroll = {
          originalRoll: roll,
          newRoll,
          fighterLevel: indomitable.fighterLevel,
        };
        roll = newRoll;
        total = newTotal;
        passed = newPassed;
        indomitableEvent = {
          event_type: 'class_feature_triggered',
          actor_participant_id: dto.participantId,
          data: {
            featureSlug: 'indomitable',
            trigger: 'saving_throw_failed',
            originalRoll: indomitableReroll.originalRoll,
            newRoll: indomitableReroll.newRoll,
            fighterLevelBonus: indomitable.fighterLevel,
            finalTotal: newTotal,
            finalSuccess: newPassed,
          },
        };
      }
    }

    const result: SavingThrowResult = {
      ability: dto.ability,
      dc: dto.dc,
      roll,
      modifier,
      total,
      success: passed,
      advantage: advantageResult,
      indomitableReroll,
    };

    const events = this.buildEvents(dto, roll, modifier, total, passed);
    if (inspirationEvent) events.unshift(inspirationEvent);
    if (indomitableEvent) events.push(indomitableEvent);
    if (exhaustionD20Penalty !== 0) {
      events.push({
        event_type: 'exhaustion_penalty_applied',
        target_participant_id: dto.participantId,
        data: {
          kind: 'saving_throw',
          level: exhLevel,
          d20Penalty: exhaustionD20Penalty,
          rawRoll: roll,
          modifier,
          finalTotal: total,
        },
      } as GameEventData);
    }
    if (auraBonus > 0 && auraSourceName) {
      events.push({
        event_type: 'aura_of_protection_applied',
        target_participant_id: dto.participantId,
        data: {
          bonus: auraBonus,
          sourcePaladinName: auraSourceName,
          ability: dto.ability,
          dc: dto.dc,
          finalTotal: total,
        },
      } as GameEventData);
    }
    return success(result, events);
  }

  /**
   * Spec 012 Paladin Aura of Protection (L6+, expande 10→30ft em L18).
   * Busca PCs Paladin L6+ vivos dentro de 10/30ft (2/6 cells) do subject
   * + que tenham hasAuraOfProtection flag. Retorna o maior CHA mod encontrado
   * (RAW: auras não stackam — pegamos a mais forte). Aplica em self + PC aliados.
   */
  private async computeAuraOfProtectionBonus(
    subjectParticipantId: string,
    userId: string,
  ): Promise<{ bonus: number; sourceName: string | null }> {
    const subject = await this.participantRepo.findOne({
      where: { id: subjectParticipantId },
    });
    if (
      !subject ||
      subject.type !== 'pc' ||
      subject.positionX == null ||
      subject.positionY == null ||
      subject.isDefeated
    ) {
      return { bonus: 0, sourceName: null };
    }

    const allies = await this.participantRepo.find({
      where: { encounterId: subject.encounterId, type: 'pc' },
    });

    let bestBonus = 0;
    let bestSource: string | null = null;
    for (const ally of allies) {
      if (
        ally.isDefeated ||
        !ally.characterId ||
        ally.positionX == null ||
        ally.positionY == null
      ) {
        continue;
      }
      const sheet = await this.sheetService.computeSheet(userId, ally.characterId).catch(() => null);
      if (!sheet || !(sheet as any).hasAuraOfProtection) continue;
      const paladinClass = (sheet as any).classes?.find((c: any) => c.slug === 'paladin');
      if (!paladinClass || paladinClass.level < 6) continue;
      const auraExpansion = Boolean((sheet as any).hasAuraExpansion);
      const reachCells = auraExpansion ? 6 : 2; // 30ft ou 10ft

      const dx = Math.abs(ally.positionX - subject.positionX);
      const dy = Math.abs(ally.positionY - subject.positionY);
      const chebyshevCells = Math.max(dx, dy);
      if (chebyshevCells > reachCells) continue;

      const chaBlock = (sheet.abilityScores ?? []).find(
        (a) => a.slug === 'cha' || a.slug === 'charisma',
      );
      const chaMod = chaBlock?.modifier ?? 0;
      const bonus = Math.max(chaMod, 1); // RAW: mínimo +1
      if (bonus > bestBonus) {
        bestBonus = bonus;
        bestSource = (ally.displayName as string | undefined) ?? ally.id;
      }
    }
    return { bonus: bestBonus, sourceName: bestSource };
  }

  /**
   * Fighter L9 Indomitable — se `indomitable_armed`, consome flag + retorna
   * fighterLevel (pra somar ao novo d20). Callers chamam DEPOIS de saber que
   * save falhou. Use/consumo já foi feito em `handleIndomitable` (arm).
   */
  private async consumeIndomitableIfArmed(
    participantId: string,
    sheet: { classes?: Array<{ slug: string; level: number }> },
  ): Promise<{ fighterLevel: number } | null> {
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant || !participant.indomitableArmed) return null;

    const fighterClass = (sheet.classes ?? []).find((c) => c.slug === 'fighter');
    const fighterLevel = fighterClass?.level ?? 0;
    if (fighterLevel < 9) {
      // Feature requer L9+; se não tem, não-op (não reroll, mantém flag — mas
      // na prática nunca chega aqui porque o arm exige L9).
      return null;
    }

    participant.indomitableArmed = false;
    await this.participantRepo.save(participant);
    return { fighterLevel };
  }

  private buildEvents(
    dto: SavingThrowDto,
    roll: number,
    modifier: number,
    total: number,
    passed: boolean,
  ): GameEventData[] {
    return [
      {
        event_type: 'saving_throw',
        data: {
          character_id: dto.characterId,
          ability: dto.ability,
          dc: dto.dc,
          roll,
          modifier,
          total,
          success: passed,
        },
      },
    ];
  }
}
