import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { EncounterService } from "./encounter.service";
import { DiceService } from "./dice.service";
import { EventService } from "./event.service";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";

/**
 * Fighter Battle Master (RAW 2024) — Combat Superiority.
 *
 * Pool de Superiority Dice: 4 @ L3, 5 @ L7, 6 @ L15. Die size: d8 / d10 (L10) / d12 (L18).
 * Maneuvers (21 RAW; MVP cobre 2 signature):
 *  - Trip Attack: hit → gasta die + target STR save DC = 8+PB+STR. Falha = Prone.
 *  - Precision Attack: before attack roll → gasta die, adiciona ao attack roll.
 *
 * Outros maneuvers (deferred pra V2):
 *  Riposte, Disarming, Menacing, Commander's Strike, etc.
 */
@Injectable()
export class BattleMasterService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly encounterService: EncounterService,
    private readonly dice: DiceService,
    private readonly eventService: EventService,
    private readonly conditionLifecycle: ConditionLifecycleService,
  ) {}

  /** Retorna max uses + die size baseado no Fighter level. */
  computeDicePool(fighterLevel: number): { max: number; dieSize: 8 | 10 | 12 } {
    const max = fighterLevel >= 15 ? 6 : fighterLevel >= 7 ? 5 : 4;
    const dieSize: 8 | 10 | 12 =
      fighterLevel >= 18 ? 12 : fighterLevel >= 10 ? 10 : 8;
    return { max, dieSize };
  }

  /**
   * Trip Attack (RAW 2024): após hit com weapon, gasta 1 die + target faz STR
   * save (DC = 8 + PB + STR mod). Falha = condição Prone.
   * Input: originalHit (bool) + targetParticipantId. Backend só valida+aplica.
   */
  async tripAttack(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantId: string,
  ): Promise<
    GameResult<{
      diceRoll: number;
      saveRoll: number;
      saveTotal: number;
      saveDc: number;
      prone: boolean;
    }>
  > {
    const fighter = await this.encounterService.getParticipant(participantId);
    const target =
      await this.encounterService.getParticipant(targetParticipantId);
    if (fighter.type !== "pc" || !fighter.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }

    const sheet = await this.sheetService.computeSheet(
      userId,
      fighter.characterId,
    );
    const fighterLv =
      (sheet.classes ?? []).find((c) => c.slug === "fighter")?.level ?? 0;
    const isBattleMaster = (
      (
        sheet as unknown as {
          features?: Array<{ slug: string; active?: boolean }>;
        }
      ).features ?? []
    )
      .filter((f) => f.active !== false)
      .some(
        (f) =>
          f.slug.startsWith("battle-master") ||
          f.slug.startsWith("combat-superiority"),
      );
    if (!isBattleMaster || fighterLv < 3) {
      return failure("Você não é Battle Master L3+.", "FEATURE_NOT_AVAILABLE");
    }

    const { max, dieSize } = this.computeDicePool(fighterLv);
    if (fighter.superiorityDiceUsed >= max) {
      return failure("Sem Superiority Dice restantes.", "NO_USES_REMAINING");
    }

    // Rola die + save roll do target
    const diceRoll = this.dice.roll(dieSize);
    const strAbility = sheet.abilityScores.find((a) => a.slug === "str");
    const strMod = strAbility?.modifier ?? 0;
    const pb = sheet.proficiencyBonus ?? 2;
    const saveDc = 8 + pb + strMod;

    // Target STR save. Monster: usa save mod do statblock; PC: sheet
    const targetSaveMod = this.getSaveModifier(target, "str");
    const saveRoll = this.dice.roll(20);
    const saveTotal = saveRoll + targetSaveMod;
    const passed = saveTotal >= saveDc;

    fighter.superiorityDiceUsed += 1;
    await this.participantRepo.save(fighter);

    let proneApplied = false;
    if (!passed) {
      // Aplica Prone
      await this.conditionLifecycle.applyCondition(target, {
        slug: "prone",
        appliedBy: fighter.id,
      });
      await this.participantRepo.save(target);
      proneApplied = true;
    }

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: fighter.id,
      target_participant_id: target.id,
      data: {
        featureSlug: "trip-attack",
        maneuver: "trip-attack",
        diceRoll,
        dieSize,
        saveRoll,
        saveTotal,
        saveDc,
        prone: proneApplied,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }

    return success(
      { diceRoll, saveRoll, saveTotal, saveDc, prone: proneApplied },
      [event],
    );
  }

  /**
   * Precision Attack (RAW 2024): before attack roll, gasta 1 die + add ao
   * attack roll. Endpoint chamado DEPOIS do attack pra aplicar o roll ao total.
   * Input: originalTotal (attack roll total). Output: newTotal incluindo die.
   */
  async precisionAttack(
    userId: string,
    encounterId: string,
    participantId: string,
    originalAttackTotal: number,
  ): Promise<
    GameResult<{
      diceRoll: number;
      newAttackTotal: number;
    }>
  > {
    const fighter = await this.encounterService.getParticipant(participantId);
    if (fighter.type !== "pc" || !fighter.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }

    const sheet = await this.sheetService.computeSheet(
      userId,
      fighter.characterId,
    );
    const fighterLv =
      (sheet.classes ?? []).find((c) => c.slug === "fighter")?.level ?? 0;
    const isBattleMaster = (
      (
        sheet as unknown as {
          features?: Array<{ slug: string; active?: boolean }>;
        }
      ).features ?? []
    )
      .filter((f) => f.active !== false)
      .some(
        (f) =>
          f.slug.startsWith("battle-master") ||
          f.slug.startsWith("combat-superiority"),
      );
    if (!isBattleMaster || fighterLv < 3) {
      return failure("Você não é Battle Master L3+.", "FEATURE_NOT_AVAILABLE");
    }

    const { max, dieSize } = this.computeDicePool(fighterLv);
    if (fighter.superiorityDiceUsed >= max) {
      return failure("Sem Superiority Dice restantes.", "NO_USES_REMAINING");
    }

    const diceRoll = this.dice.roll(dieSize);
    const newTotal = originalAttackTotal + diceRoll;

    fighter.superiorityDiceUsed += 1;
    await this.participantRepo.save(fighter);

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: fighter.id,
      data: {
        featureSlug: "precision-attack",
        maneuver: "precision-attack",
        diceRoll,
        dieSize,
        originalAttackTotal,
        newAttackTotal: newTotal,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }

    return success({ diceRoll, newAttackTotal: newTotal }, [event]);
  }

  private getSaveModifier(
    p: EncounterParticipantEntity,
    abilitySlug: string,
  ): number {
    // Monster: lê de statblock via monster relation
    if (
      p.type === "monster" &&
      (p as unknown as { monster?: { saving_throws?: Record<string, number> } })
        .monster?.saving_throws
    ) {
      const throws = (
        p as unknown as { monster: { saving_throws: Record<string, number> } }
      ).monster.saving_throws;
      return throws[abilitySlug] ?? 0;
    }
    // Fallback conservador
    return 0;
  }
}
