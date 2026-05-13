import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
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
export class BarbarianFeaturesService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly stateService: CharacterStateService,
    private readonly encounterService: EncounterService,
    private readonly dice: DiceService,
    private readonly eventService: EventService,
  ) {}


  async relentlessRage(
    userId: string,
    encounterId: string,
    participantId: string,
  ): Promise<
    GameResult<{
      dc: number;
      conMod: number;
      roll: number;
      total: number;
      success: boolean;
      newHp: number;
      usesAfter: number;
    }>
  > {
    const barbarian = await this.encounterService.getParticipant(participantId);
    if (barbarian.type !== "pc" || !barbarian.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      barbarian.characterId,
    );
    const barbLv =
      (sheet.classes ?? []).find((c) => c.slug === "barbarian")?.level ?? 0;
    const hasRelentless =
      (sheet as unknown as { hasRelentlessRage?: boolean })
        .hasRelentlessRage === true;
    if (!hasRelentless || barbLv < 11) {
      return failure(
        "Requer Barbarian L11+ com Relentless Rage.",
        "FEATURE_NOT_AVAILABLE",
      );
    }
    if (!(barbarian.conditions ?? []).includes("raging")) {
      return failure("Relentless Rage exige Rage ativo.", "RAGE_REQUIRED");
    }


    if (barbarian.dyingState !== "dying" && (barbarian.currentHp ?? 1) > 0) {
      return failure(
        "Trigger é 0 HP. HP atual > 0 e não dying.",
        "TRIGGER_CONDITION_NOT_MET",
      );
    }

    const uses = barbarian.relentlessRageUsesUsed ?? 0;
    const dc = 10 + uses * 5;
    const conAbility = sheet.abilityScores.find((a) => a.slug === "con");
    const conMod = conAbility?.modifier ?? 0;
    const roll = this.dice.roll(20);
    const total = roll + conMod;
    const passed = total >= dc;

    let newHp = barbarian.currentHp ?? 0;
    if (passed) {

      const hpResult = await this.stateService.updateHp(
        userId,
        barbarian.characterId,
        {
          healing: 1,
        },
      );
      newHp = hpResult.currentHp;

      barbarian.dyingState = "none";
      barbarian.isDefeated = false;
      barbarian.currentHp = newHp;
      barbarian.relentlessRageUsesUsed = uses + 1;
      await this.participantRepo.save(barbarian);
    }

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: barbarian.id,
      data: {
        featureSlug: "relentless-rage",
        dc,
        conMod,
        roll,
        total,
        success: passed,
        newHp,
        usesBefore: uses,
        usesAfter: passed ? uses + 1 : uses,
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
        dc,
        conMod,
        roll,
        total,
        success: passed,
        newHp,
        usesAfter: passed ? uses + 1 : uses,
      },
      [event],
    );
  }


  async indomitableMight(
    userId: string,
    encounterId: string,
    participantId: string,
    rawCheckTotal: number,
    abilitySlug: "str" | "dex" | "con" | "int" | "wis" | "cha",
  ): Promise<
    GameResult<{
      rawCheckTotal: number;
      abilitySlug: string;
      abilityScore: number;
      effectiveTotal: number;
      applied: boolean;
    }>
  > {
    const barbarian = await this.encounterService.getParticipant(participantId);
    if (barbarian.type !== "pc" || !barbarian.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      barbarian.characterId,
    );
    const barbLv =
      (sheet.classes ?? []).find((c) => c.slug === "barbarian")?.level ?? 0;
    const hasIM =
      (sheet as unknown as { hasIndomitableMight?: boolean })
        .hasIndomitableMight === true;
    if (!hasIM || barbLv < 18) {
      return failure(
        "Requer Barbarian L18+ com Indomitable Might.",
        "FEATURE_NOT_AVAILABLE",
      );
    }

    const ability = sheet.abilityScores.find((a) => a.slug === abilitySlug);
    const abilityScore = ability?.score ?? 0;

    const applicable = abilitySlug === "str";
    const effectiveTotal =
      applicable && rawCheckTotal < abilityScore ? abilityScore : rawCheckTotal;
    const applied = applicable && effectiveTotal > rawCheckTotal;

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: barbarian.id,
      data: {
        featureSlug: "indomitable-might",
        abilitySlug,
        abilityScore,
        rawCheckTotal,
        effectiveTotal,
        applied,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }

    return success(
      { rawCheckTotal, abilitySlug, abilityScore, effectiveTotal, applied },
      [event],
    );
  }
}
