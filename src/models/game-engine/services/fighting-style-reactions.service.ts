import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterService } from "./encounter.service";
import { DiceService } from "./dice.service";
import { EventService } from "./event.service";
import { EffectInstanceService } from "./effect-instance.service";
import { canTakeReactionFromConditions } from "./condition-effects.service";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";


@Injectable()
export class FightingStyleReactionsService {
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
    private readonly effectInstances: EffectInstanceService,
  ) {}


  async interception(
    userId: string,
    encounterId: string,
    fighterParticipantId: string,
    allyParticipantId: string,
    damageAmount: number,
  ): Promise<GameResult<{ reduction: number; roll: number }>> {
    const fighter =
      await this.encounterService.getParticipant(fighterParticipantId);
    const ally = await this.encounterService.getParticipant(allyParticipantId);

    if (fighter.type !== "pc" || !fighter.characterId) {
      return failure(
        "Apenas PCs podem usar Fighting Style.",
        "INVALID_PARTICIPANT",
      );
    }
    if (fighter.reactionsUsed >= 1) {
      return failure("Reação já usada neste turno.", "NO_REACTION_AVAILABLE");
    }
    if (!canTakeReactionFromConditions(fighter.conditions)) {
      return failure(
        "A condição atual impede reactions.",
        "CONDITION_PREVENTS_REACTION",
      );
    }


    const sheet = await this.sheetService.computeSheet(
      userId,
      fighter.characterId,
    );
    const fs = (
      sheet as unknown as { originDetails?: { fightingStyleIndex?: string } }
    ).originDetails?.fightingStyleIndex;
    if (fs !== "interception") {
      return failure(
        "Você não conhece Fighting Style: Interception.",
        "FEATURE_NOT_AVAILABLE",
      );
    }


    if (
      fighter.positionX == null ||
      fighter.positionY == null ||
      ally.positionX == null ||
      ally.positionY == null
    ) {
      return failure(
        "Posições indefinidas — Interception exige aliado adjacente.",
        "OUT_OF_RANGE",
      );
    }
    const dx = Math.abs(fighter.positionX - ally.positionX);
    const dy = Math.abs(fighter.positionY - ally.positionY);
    if (Math.max(dx, dy) > 1) {
      return failure("Aliado fora de alcance (5ft).", "OUT_OF_RANGE");
    }


    const roll = this.dice.roll(10);
    const pb = sheet.proficiencyBonus ?? 2;
    const raw = roll + pb;
    const reduction = Math.max(1, Math.min(damageAmount, raw));


    if (ally.type === "pc" && ally.characterId) {
      try {
        const hpRes = await this.stateService.updateHp(
          userId,
          ally.characterId,
          { healing: reduction },
        );
        ally.currentHp = hpRes.currentHp;
      } catch {

        ally.currentHp = Math.min(
          (ally.currentHp ?? 0) + reduction,
          ally.maxHp ?? 999,
        );
      }
    } else {
      ally.currentHp = Math.min(
        (ally.currentHp ?? 0) + reduction,
        ally.maxHp ?? 999,
      );
    }
    await this.participantRepo.save(ally);


    fighter.reactionsUsed += 1;
    await this.participantRepo.save(fighter);

    const event: GameEventData = {
      event_type: "fighting_style_reaction",
      actor_participant_id: fighter.id,
      target_participant_id: ally.id,
      data: {
        style: "interception",
        roll,
        proficiencyBonus: pb,
        rawReduction: raw,
        damageAmount,
        finalReduction: reduction,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }

    return success({ reduction, roll }, [event]);
  }


  async protection(
    userId: string,
    encounterId: string,
    fighterParticipantId: string,
    allyParticipantId: string,
  ): Promise<GameResult<{ applied: boolean }>> {
    const fighter =
      await this.encounterService.getParticipant(fighterParticipantId);
    const ally = await this.encounterService.getParticipant(allyParticipantId);

    if (fighter.type !== "pc" || !fighter.characterId) {
      return failure(
        "Apenas PCs podem usar Fighting Style.",
        "INVALID_PARTICIPANT",
      );
    }
    if (fighter.reactionsUsed >= 1) {
      return failure("Reação já usada neste turno.", "NO_REACTION_AVAILABLE");
    }
    if (!canTakeReactionFromConditions(fighter.conditions)) {
      return failure(
        "A condição atual impede reactions.",
        "CONDITION_PREVENTS_REACTION",
      );
    }

    const sheet = await this.sheetService.computeSheet(
      userId,
      fighter.characterId,
    );
    const fs = (
      sheet as unknown as { originDetails?: { fightingStyleIndex?: string } }
    ).originDetails?.fightingStyleIndex;
    if (fs !== "protection") {
      return failure(
        "Você não conhece Fighting Style: Protection.",
        "FEATURE_NOT_AVAILABLE",
      );
    }



    const hasShield = (sheet.equipment ?? []).some((e) => {
      const isShieldSlug =
        e.slug?.includes("shield") || e.name?.toLowerCase().includes("shield");
      if (!isShieldSlug) return false;
      const inHand =
        (e as { offHand?: boolean; mainHand?: boolean }).offHand === true;
      return e.equipped || inHand;
    });
    if (!hasShield) {
      return failure(
        "Protection requer empunhar um escudo.",
        "REQUIRES_SHIELD",
      );
    }


    if (
      fighter.positionX == null ||
      fighter.positionY == null ||
      ally.positionX == null ||
      ally.positionY == null
    ) {
      return failure("Posições indefinidas.", "OUT_OF_RANGE");
    }
    const dx = Math.abs(fighter.positionX - ally.positionX);
    const dy = Math.abs(fighter.positionY - ally.positionY);
    if (Math.max(dx, dy) > 1) {
      return failure("Aliado fora de alcance (5ft).", "OUT_OF_RANGE");
    }


    const { effect, events } = await this.effectInstances.addEffect(ally, {
      kind: "grant_disadvantage_to_attackers",
      sourceFeatureSlug: "fighting-style:protection",
      sourceCasterParticipantId: fighter.id,
      payload: { masterySlug: "protection" },
      expiresAt: { kind: "until_consumed" },
      requiresConcentration: false,
    });


    fighter.reactionsUsed += 1;
    await this.participantRepo.save(fighter);

    const event: GameEventData = {
      event_type: "fighting_style_reaction",
      actor_participant_id: fighter.id,
      target_participant_id: ally.id,
      data: {
        style: "protection",
        effectId: effect.id,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }

    return success({ applied: true }, [...events, event]);
  }
}
