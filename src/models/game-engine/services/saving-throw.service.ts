import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { DiceService } from "./dice.service";
import { ConditionEffectsService } from "./condition-effects.service";
import { EventService } from "./event.service";
import { InspirationService } from "./inspiration.service";
import { ExhaustionService } from "./exhaustion.service";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";
import { SavingThrowResult } from "../interfaces/combat.interfaces";
import { AdvantageResult } from "../interfaces/dice.interfaces";



export interface SavingThrowDto {
  characterId: string;
  userId: string;
  ability: string;
  dc: number;
  advantage?: boolean;
  disadvantage?: boolean;
  sessionId?: string;
  encounterId?: string;

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

  async rollSavingThrow(
    dto: SavingThrowDto,
  ): Promise<GameResult<SavingThrowResult>> {
    const sheet = await this.sheetService.computeSheet(
      dto.userId,
      dto.characterId,
    );
    if (!sheet) {
      return failure("Personagem nao encontrado.", "INVALID_PARTICIPANT");
    }


    const saveBlock = sheet.savingThrows.find(
      (s) =>
        s.slug === dto.ability ||
        s.name.toLowerCase() === dto.ability.toLowerCase(),
    );
    if (!saveBlock) {
      return failure(
        `Ability '${dto.ability}' nao encontrada.`,
        "INVALID_ACTION",
      );
    }

    const modifier = saveBlock.bonus;


    const conditions = sheet.conditions ?? [];
    const condMods = this.conditionEffects.getSavingThrowModifiers(
      conditions,
      dto.ability,
    );

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


    let hasAdvantage = dto.advantage ?? false;
    let hasDisadvantage = dto.disadvantage ?? false;

    if (condMods.hasAdvantage) hasAdvantage = true;
    if (condMods.hasDisadvantage) hasDisadvantage = true;


    let inspirationEvent: GameEventData | null = null;
    if (dto.participantId) {
      const inspResult = await this.inspirationService.consumeIfArmed(
        dto.participantId,
        "saving_throw",
      );
      if (inspResult.consumed && inspResult.eventData) {
        hasAdvantage = true;
        inspirationEvent = inspResult.eventData;
      }
    }


    let roll: number;
    let advantageResult: AdvantageResult | undefined;

    if (hasAdvantage && !hasDisadvantage) {
      const r = this.diceService.rollWithAdvantage();
      roll = r.chosen;
      advantageResult = {
        roll1: r.roll1,
        roll2: r.roll2,
        chosen: r.chosen,
        discarded: r.roll1 === r.chosen ? r.roll2 : r.roll1,
      };
    } else if (hasDisadvantage && !hasAdvantage) {
      const r = this.diceService.rollWithDisadvantage();
      roll = r.chosen;
      advantageResult = {
        roll1: r.roll1,
        roll2: r.roll2,
        chosen: r.chosen,
        discarded: r.roll1 === r.chosen ? r.roll2 : r.roll1,
      };
    } else {
      roll = this.diceService.roll(20);
    }




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



    let effectBonusSum = 0;
    const rolledEffectBonuses: Array<{
      source: string;
      dice?: string;
      rolled: number;
    }> = [];
    if (dto.participantId) {
      const subject = await this.participantRepo.findOne({
        where: { id: dto.participantId },
      });
      for (const e of subject?.effectInstances ?? []) {
        if (e.kind === "save_bonus" && e.payload?.diceExpression) {
          const r = this.diceService.rollExpression(e.payload.diceExpression);
          rolledEffectBonuses.push({
            source: e.sourceSpellSlug ?? "effect",
            dice: e.payload.diceExpression,
            rolled: r.total,
          });
          effectBonusSum += r.total;
        } else if (e.kind === "save_penalty" && e.payload?.diceExpression) {
          const r = this.diceService.rollExpression(e.payload.diceExpression);
          rolledEffectBonuses.push({
            source: e.sourceSpellSlug ?? "effect",
            dice: `-${e.payload.diceExpression}`,
            rolled: -r.total,
          });
          effectBonusSum += -r.total;
        }
      }
    }


    const exhLevel =
      (sheet as { exhaustionLevel?: number }).exhaustionLevel ?? 0;
    const exhMods =
      exhLevel > 0
        ? this.exhaustionService.getModifiers(exhLevel, "2024_ten_levels")
        : null;
    const exhaustionD20Penalty = exhMods?.d20Penalty ?? 0;

    let total =
      roll + modifier + auraBonus + effectBonusSum + exhaustionD20Penalty;
    let passed = total >= dto.dc;



    let indomitableEvent: GameEventData | null = null;
    let indomitableReroll:
      | { originalRoll: number; newRoll: number; fighterLevel: number }
      | undefined;
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
          event_type: "class_feature_triggered",
          actor_participant_id: dto.participantId,
          data: {
            featureSlug: "indomitable",
            trigger: "saving_throw_failed",
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
        event_type: "exhaustion_penalty_applied",
        target_participant_id: dto.participantId,
        data: {
          kind: "saving_throw",
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
        event_type: "aura_of_protection_applied",
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


  private async computeAuraOfProtectionBonus(
    subjectParticipantId: string,
    userId: string,
  ): Promise<{ bonus: number; sourceName: string | null }> {
    const subject = await this.participantRepo.findOne({
      where: { id: subjectParticipantId },
    });
    if (
      !subject ||
      subject.type !== "pc" ||
      subject.positionX == null ||
      subject.positionY == null ||
      subject.isDefeated
    ) {
      return { bonus: 0, sourceName: null };
    }

    const allies = await this.participantRepo.find({
      where: { encounterId: subject.encounterId, type: "pc" },
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
      const sheet = await this.sheetService
        .computeSheet(userId, ally.characterId)
        .catch(() => null);
      if (!sheet || !(sheet as any).hasAuraOfProtection) continue;
      const paladinClass = (sheet as any).classes?.find(
        (c: any) => c.slug === "paladin",
      );
      if (!paladinClass || paladinClass.level < 6) continue;
      const auraExpansion = Boolean((sheet as any).hasAuraExpansion);
      const reachCells = auraExpansion ? 6 : 2;

      const dx = Math.abs(ally.positionX - subject.positionX);
      const dy = Math.abs(ally.positionY - subject.positionY);
      const chebyshevCells = Math.max(dx, dy);
      if (chebyshevCells > reachCells) continue;

      const chaBlock = (sheet.abilityScores ?? []).find(
        (a) => a.slug === "cha" || a.slug === "charisma",
      );
      const chaMod = chaBlock?.modifier ?? 0;
      const bonus = Math.max(chaMod, 1);
      if (bonus > bestBonus) {
        bestBonus = bonus;
        bestSource = (ally.displayName as string | undefined) ?? ally.id;
      }
    }
    return { bonus: bestBonus, sourceName: bestSource };
  }


  private async consumeIndomitableIfArmed(
    participantId: string,
    sheet: { classes?: Array<{ slug: string; level: number }> },
  ): Promise<{ fighterLevel: number } | null> {
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant || !participant.indomitableArmed) return null;

    const fighterClass = (sheet.classes ?? []).find(
      (c) => c.slug === "fighter",
    );
    const fighterLevel = fighterClass?.level ?? 0;
    if (fighterLevel < 9) {


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
        event_type: "saving_throw",
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
