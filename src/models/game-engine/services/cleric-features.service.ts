import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { EncounterService } from "./encounter.service";
import { DiceService } from "./dice.service";
import { EventService } from "./event.service";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";


@Injectable()
export class ClericFeaturesService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly encounterService: EncounterService,
    private readonly dice: DiceService,
    private readonly eventService: EventService,
  ) {}


  async searUndead(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantIds: string[],
  ): Promise<
    GameResult<{
      damageOnFail: number;
      saveDc: number;
      results: Array<{
        targetParticipantId: string;
        saveRoll: number;
        saveTotal: number;
        passed: boolean;
        damageApplied: number;
      }>;
    }>
  > {
    const cleric = await this.encounterService.getParticipant(participantId);
    if (cleric.type !== "pc" || !cleric.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      cleric.characterId,
    );
    const hasSear =
      (sheet as unknown as { hasSearUndead?: boolean }).hasSearUndead === true;
    const clericLv =
      (sheet.classes ?? []).find((c) => c.slug === "cleric")?.level ?? 0;
    if (!hasSear || clericLv < 5) {
      return failure(
        "Requer Cleric L5+ com Sear Undead.",
        "FEATURE_NOT_AVAILABLE",
      );
    }

    const wisAbility = sheet.abilityScores.find((a) => a.slug === "wis");
    const wisMod = wisAbility?.modifier ?? 0;
    const pb = sheet.proficiencyBonus ?? 2;
    const saveDc = 8 + wisMod + pb;
    const damageOnFail = 10 + 5 * (clericLv - 5);
    const damageOnSuccess = Math.floor(damageOnFail / 2);

    const results: Array<{
      targetParticipantId: string;
      saveRoll: number;
      saveTotal: number;
      passed: boolean;
      damageApplied: number;
    }> = [];

    for (const tid of targetParticipantIds) {
      const target = await this.encounterService.getParticipant(tid);
      const conMod = this.getSaveModifier(target, "con");
      const saveRoll = this.dice.roll(20);
      const saveTotal = saveRoll + conMod;
      const passed = saveTotal >= saveDc;
      const damage = passed ? damageOnSuccess : damageOnFail;
      const prevHp = target.currentHp ?? 0;
      target.currentHp = Math.max(0, prevHp - damage);
      await this.participantRepo.save(target);
      results.push({
        targetParticipantId: tid,
        saveRoll,
        saveTotal,
        passed,
        damageApplied: damage,
      });
    }

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: cleric.id,
      data: {
        featureSlug: "sear-undead",
        saveDc,
        damageOnFail,
        damageOnSuccess,
        results,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }
    return success({ damageOnFail, saveDc, results }, [event]);
  }


  async divineIntervention(
    userId: string,
    encounterId: string,
    participantId: string,
    spellSlug: string,
    slotLevel: number,
  ): Promise<
    GameResult<{
      spellSlug: string;
      slotLevel: number;
      clericLevel: number;
      capSlot: number;
      accepted: boolean;
      reason?: string;
    }>
  > {
    const cleric = await this.encounterService.getParticipant(participantId);
    if (cleric.type !== "pc" || !cleric.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      cleric.characterId,
    );
    const hasDI =
      (sheet as unknown as { hasDivineIntervention?: boolean })
        .hasDivineIntervention === true;
    const clericLv =
      (sheet.classes ?? []).find((c) => c.slug === "cleric")?.level ?? 0;
    if (!hasDI || clericLv < 10) {
      return failure(
        "Requer Cleric L10+ com Divine Intervention.",
        "FEATURE_NOT_AVAILABLE",
      );
    }


    const hasGreater =
      (sheet as unknown as { hasGreaterDivineIntervention?: boolean })
        .hasGreaterDivineIntervention === true;
    const capSlot = hasGreater ? 9 : 5;
    const accepted = slotLevel >= 1 && slotLevel <= capSlot;

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: cleric.id,
      data: {
        featureSlug: "divine-intervention",
        spellSlug,
        slotLevel,
        capSlot,
        clericLevel: clericLv,
        accepted,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }

    return success(
      {
        spellSlug,
        slotLevel,
        clericLevel: clericLv,
        capSlot,
        accepted,
        reason: accepted
          ? undefined
          : `Slot level ${slotLevel} excede cap ${capSlot}`,
      },
      [event],
    );
  }


  async preserveLife(
    userId: string,
    encounterId: string,
    participantId: string,
    allocations: Array<{ targetParticipantId: string; hp: number }>,
  ): Promise<
    GameResult<{
      poolTotal: number;
      capPerAlly: number;
      totalHealed: number;
      results: Array<{
        targetParticipantId: string;
        healed: number;
        newHp: number;
      }>;
    }>
  > {
    const cleric = await this.encounterService.getParticipant(participantId);
    if (cleric.type !== "pc" || !cleric.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      cleric.characterId,
    );
    const hasPL =
      (sheet as unknown as { hasPreserveLife?: boolean }).hasPreserveLife ===
      true;
    const clericLv =
      (sheet.classes ?? []).find((c) => c.slug === "cleric")?.level ?? 0;
    if (!hasPL || clericLv < 3) {
      return failure(
        "Requer Cleric Life Domain L3+ com Preserve Life.",
        "FEATURE_NOT_AVAILABLE",
      );
    }

    const poolTotal = 5 * clericLv;
    const capPerAlly = Math.floor(poolTotal / 2);
    const requestedTotal = allocations.reduce((s, a) => s + a.hp, 0);

    if (requestedTotal > poolTotal) {
      return failure(
        `Allocation ${requestedTotal} excede pool ${poolTotal}.`,
        "ALLOCATION_EXCEEDS_POOL",
      );
    }
    const overCap = allocations.find((a) => a.hp > capPerAlly);
    if (overCap) {
      return failure(
        `Target ${overCap.targetParticipantId} recebe ${overCap.hp} > cap ${capPerAlly}.`,
        "ALLOCATION_EXCEEDS_CAP_PER_ALLY",
      );
    }

    const results: Array<{
      targetParticipantId: string;
      healed: number;
      newHp: number;
    }> = [];
    for (const a of allocations) {
      const target = await this.encounterService.getParticipant(
        a.targetParticipantId,
      );
      const prevHp = target.currentHp ?? 0;
      const newHp = Math.min(target.maxHp ?? prevHp, prevHp + a.hp);
      target.currentHp = newHp;
      await this.participantRepo.save(target);
      results.push({
        targetParticipantId: a.targetParticipantId,
        healed: a.hp,
        newHp,
      });
    }

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: cleric.id,
      data: {
        featureSlug: "preserve-life",
        poolTotal,
        capPerAlly,
        totalHealed: requestedTotal,
        results,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }
    return success(
      { poolTotal, capPerAlly, totalHealed: requestedTotal, results },
      [event],
    );
  }


  async blessedStrikes(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantId: string,
    trigger: "melee-hit" | "cantrip-save-failed",
  ): Promise<
    GameResult<{
      trigger: string;
      damage: number;
      diceCount: 1 | 2;
      targetPrevHp: number;
      targetNewHp: number;
    }>
  > {
    const cleric = await this.encounterService.getParticipant(participantId);
    if (cleric.type !== "pc" || !cleric.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      cleric.characterId,
    );
    const hasBS =
      (sheet as unknown as { hasBlessedStrikes?: boolean })
        .hasBlessedStrikes === true;
    const hasImproved =
      (sheet as unknown as { hasImprovedBlessedStrikes?: boolean })
        .hasImprovedBlessedStrikes === true;
    const clericLv =
      (sheet.classes ?? []).find((c) => c.slug === "cleric")?.level ?? 0;
    if (!hasBS || clericLv < 7) {
      return failure(
        "Requer Cleric L7+ com Blessed Strikes.",
        "FEATURE_NOT_AVAILABLE",
      );
    }

    const diceCount: 1 | 2 = hasImproved ? 2 : 1;
    let damage = 0;
    for (let i = 0; i < diceCount; i++) damage += this.dice.roll(8);

    const target =
      await this.encounterService.getParticipant(targetParticipantId);
    const prevHp = target.currentHp ?? 0;
    target.currentHp = Math.max(0, prevHp - damage);
    await this.participantRepo.save(target);

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: cleric.id,
      target_participant_id: target.id,
      data: {
        featureSlug: hasImproved
          ? "improved-blessed-strikes"
          : "blessed-strikes",
        trigger,
        damage,
        diceCount,
        targetPrevHp: prevHp,
        targetNewHp: target.currentHp,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }
    return success(
      {
        trigger,
        damage,
        diceCount,
        targetPrevHp: prevHp,
        targetNewHp: target.currentHp,
      },
      [event],
    );
  }

  private getSaveModifier(
    p: EncounterParticipantEntity,
    abilitySlug: string,
  ): number {
    if (
      p.type === "monster" &&
      (p as unknown as { monster?: { saving_throws?: Record<string, number> } })
        .monster?.saving_throws
    ) {
      return (
        (p as unknown as { monster: { saving_throws: Record<string, number> } })
          .monster.saving_throws[abilitySlug] ?? 0
      );
    }
    return 0;
  }
}
