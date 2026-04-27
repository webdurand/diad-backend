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

/**
 * Barbarian upper-tier features (RAW 2024 XPHB):
 *  - Relentless Rage L11: quando PC barbarian em rage cai a 0 HP, rola CON save
 *    DC 10 + 5×uses. Passa: volta pra 1 HP (dying state limpo). Reset: long rest.
 *  - Indomitable Might L18: STR check, se total < score, usa score.
 *  - Persistent Rage L15: flag sheet (computed). Rage só acaba se Incapacitated
 *    ou voluntariamente. Enforcement em V2 (rage-end hook).
 *  - Primal Champion L20: STR/CON +4 com cap 25. Wire em level-up (ability cap).
 */
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

  /**
   * Relentless Rage (Barbarian L11, RAW 2024).
   * Trigger: PC barbarian raging foi pra 0 HP.
   * Rola CON save DC = 10 + 5 × (uses já consumidos).
   * Success: heal pra 1 HP + marca uso. Failure: no-op (dying state preserva).
   */
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
    // PCs vivem HP em character_state. Use dyingState como trigger (combat.service
    // marca 'dying' quando hpAfter=0). Participant.currentHp pode estar stale.
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
      // heal pra 1 HP
      const hpResult = await this.stateService.updateHp(
        userId,
        barbarian.characterId,
        {
          healing: 1,
        },
      );
      newHp = hpResult.currentHp;
      // Limpa dying state
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

  /**
   * Indomitable Might (Barbarian L18, RAW 2024). Check STR: se total < STR score,
   * usa STR score como resultado. Endpoint recebe rawCheckTotal + abilitySlug.
   * Backend retorna effectiveTotal (max(rawTotal, strScore) se ability='str').
   */
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
    // Só aplica pra STR (RAW 2024 XPHB: especifica STR check/save)
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
