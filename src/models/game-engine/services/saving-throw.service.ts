import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { DiceService } from './dice.service';
import { ConditionEffectsService } from './condition-effects.service';
import { EventService } from './event.service';
import { InspirationService } from './inspiration.service';
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

    let total = roll + modifier;
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
    return success(result, events);
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
