

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CharacterEntity } from "src/entities/character.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

export interface RevivifyCheckInput {
  characterId: string;
  timeSinceDeathMin: number;
  hasDiamond300gp?: boolean;
  casterCharacterId?: string | null;
  campaignId?: string;

  targetDyingState?: "none" | "dying" | "stable" | "dead" | "captured";
  bodyDestroyed?: boolean;
  traceId?: string;
}

export interface RevivifyCheckResult {
  eligible: boolean;
  missingRequirements: string[];
  windowRemainingSec: number;
  casterKnowsSpell: boolean | null;
  narrativeDescriptor: string;
}

const REVIVIFY_WINDOW_MIN = 1;

@Injectable()
export class RevivifyCheckService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly charRepo: Repository<CharacterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly partRepo: Repository<EncounterParticipantEntity>,
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
  ) {}

  async check(input: RevivifyCheckInput): Promise<RevivifyCheckResult> {
    const character = await this.charRepo.findOne({
      where: { id: input.characterId },
    });
    if (!character) {
      throw new DomainException(
        ErrorCode.CHARACTER_NOT_FOUND,
        `Character ${input.characterId} não encontrado.`,
      );
    }



    let dyingState = input.targetDyingState;
    if (!dyingState) {
      const part = await this.partRepo.findOne({
        where: { characterId: input.characterId },
      });
      dyingState = (part?.dyingState as typeof dyingState) ?? "none";
    }

    if (dyingState !== "dead") {
      throw new DomainException(
        ErrorCode.REVIVIFY_TARGET_NOT_DEAD,
        `Personagem '${character.name}' tem dyingState='${dyingState}', não 'dead'.`,
        {
          context: {
            characterId: input.characterId,
            currentDyingState: dyingState,
          },
        },
      );
    }

    const missing: string[] = [];


    if (input.timeSinceDeathMin < 0) {
      missing.push("invalid_time_input");
    }
    if (input.timeSinceDeathMin > REVIVIFY_WINDOW_MIN) {
      missing.push("time_window_exceeded");
    }
    const windowRemainingSec = Math.max(
      0,
      Math.floor((REVIVIFY_WINDOW_MIN - input.timeSinceDeathMin) * 60),
    );


    if (input.hasDiamond300gp !== true) {
      missing.push("missing_diamond_300gp");
    }


    if (input.bodyDestroyed === true) {
      throw new DomainException(
        ErrorCode.REVIVIFY_BODY_DESTROYED,
        `Corpo de '${character.name}' foi destruído. Necessário Resurrection.`,
        { context: { characterId: input.characterId } },
      );
    }



    const casterKnowsSpell: boolean | null = null;

    const eligible = missing.length === 0;
    const descriptor = eligible
      ? `${windowRemainingSec}s restantes — Revivify aplicável.`
      : `Revivify bloqueado: ${missing.join(", ")}.`;

    if (input.campaignId) {
      try {
        const envelope = this.factory.build({
          eventCategory: "NarrativeEvent",
          eventType: "revivify_eligibility_checked",
          source: {
            service: "diad-backend",
            module: "RevivifyCheckService.check",
            traceId: input.traceId,
          },
          scope: { campaignId: input.campaignId },
          payload: {
            characterId: input.characterId,
            eligible,
            missingRequirements: missing,
            windowRemainingSec,
            casterCharacterId: input.casterCharacterId ?? null,
          },
          narrativeDescriptor: descriptor,
        });
        await this.eventBus.publish(envelope);
      } catch {

      }
    }

    return {
      eligible,
      missingRequirements: missing,
      windowRemainingSec,
      casterKnowsSpell,
      narrativeDescriptor: descriptor,
    };
  }
}
