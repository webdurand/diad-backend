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
export class TacticalFeaturesService {
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


  async tacticalMind(
    userId: string,
    encounterId: string,
    participantId: string,
    originalCheckTotal: number,
    dc: number,
  ): Promise<
    GameResult<{
      bonusRoll: number;
      newTotal: number;
      success: boolean;
      secondWindConsumed: boolean;
    }>
  > {
    const participant =
      await this.encounterService.getParticipant(participantId);
    if (participant.type !== "pc" || !participant.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }

    const sheet = await this.sheetService.computeSheet(
      userId,
      participant.characterId,
    );
    const fighterLv =
      (sheet.classes ?? []).find((c) => c.slug === "fighter")?.level ?? 0;
    if (fighterLv < 2) {
      return failure(
        "Tactical Mind requer Fighter L2+.",
        "FEATURE_NOT_AVAILABLE",
      );
    }
    const hasFeature = (
      (
        sheet as unknown as {
          features?: Array<{ slug: string; active?: boolean }>;
        }
      ).features ?? []
    )
      .filter((f) => f.active !== false)
      .some((f) => f.slug.startsWith("tactical-mind"));
    if (!hasFeature) {
      return failure("Você não tem Tactical Mind.", "FEATURE_NOT_AVAILABLE");
    }


    const maxSw = fighterLv >= 10 ? 3 : fighterLv >= 4 ? 2 : 1;
    const sheetState = sheet as unknown as {
      featureUsesUsed?: Record<string, number>;
    };
    const swUsed = sheetState.featureUsesUsed?.["second-wind"] ?? 0;
    if (swUsed >= maxSw) {
      return failure(
        "Sem usos de Second Wind disponíveis.",
        "NO_USES_REMAINING",
      );
    }


    const bonusRoll = this.dice.roll(10);
    const newTotal = originalCheckTotal + bonusRoll;
    const passed = newTotal >= dc;

    let consumed = false;
    if (passed) {
      await this.stateService.incrementFeatureUses(
        participant.characterId,
        "second-wind",
        1,
      );
      consumed = true;
    }

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: participant.id,
      data: {
        featureSlug: "tactical-mind",
        originalCheckTotal,
        dc,
        bonusRoll,
        newTotal,
        success: passed,
        secondWindConsumed: consumed,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }

    return success(
      { bonusRoll, newTotal, success: passed, secondWindConsumed: consumed },
      [event],
    );
  }


  async tacticalMasterArm(
    userId: string,
    encounterId: string,
    participantId: string,
    masteryOverride: "push" | "sap" | "slow",
  ): Promise<GameResult<{ armed: boolean; masteryOverride: string }>> {
    const participant =
      await this.encounterService.getParticipant(participantId);
    if (participant.type !== "pc" || !participant.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }

    const sheet = await this.sheetService.computeSheet(
      userId,
      participant.characterId,
    );
    const hasFeature = (
      (
        sheet as unknown as {
          features?: Array<{ slug: string; active?: boolean }>;
        }
      ).features ?? []
    )
      .filter((f) => f.active !== false)
      .some((f) => f.slug.startsWith("tactical-master"));
    if (!hasFeature) {
      return failure("Você não tem Tactical Master.", "FEATURE_NOT_AVAILABLE");
    }





    participant.tacticalMasterOverride = masteryOverride;
    await this.participantRepo.save(participant);

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: participant.id,
      data: {
        featureSlug: "tactical-master",
        trigger: "arm_override",
        masteryOverride,
      },
    };
    const enc = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (enc?.sessionId) {
      await this.eventService.emit(enc.sessionId, encounterId, [event]);
    }
    return success({ armed: true, masteryOverride }, [event]);
  }
}
