

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

export type DyingState = "none" | "dying" | "stable" | "dead" | "captured";
export type DyingReason =
  | "surrender"
  | "stabilized"
  | "massive_damage"
  | "narrative_death"
  | "narrative_capture"
  | "rescued"
  | "executed";

const VALID_TRANSITIONS: Record<DyingState, DyingState[]> = {
  none: ["dying", "dead", "captured"],
  dying: ["stable", "dead", "none", "captured"],
  stable: ["none", "dying", "dead", "captured"],
  dead: ["none", "captured"],
  captured: ["none", "dying", "stable", "dead"],
};

export interface SetDyingStateInput {
  participantId: string;
  state: DyingState;
  reason: DyingReason;
  narrativeDescriptor?: string;
  campaignId?: string;
  encounterId?: string;
  traceId?: string;
}

export interface SetDyingStateResult {
  participantId: string;
  previousState: DyingState;
  currentState: DyingState;
  deathSavesReset: boolean;
  removedFromTurnOrder: boolean;
}

@Injectable()
export class DyingStateService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly partRepo: Repository<EncounterParticipantEntity>,
    private readonly eventBus: EventBusService,
    private readonly factory: EventEnvelopeFactory,
  ) {}

  async setState(input: SetDyingStateInput): Promise<SetDyingStateResult> {
    const participant = await this.partRepo.findOne({
      where: { id: input.participantId },
    });
    if (!participant) {
      throw new DomainException(
        ErrorCode.PARTICIPANT_NOT_FOUND,
        `Participant ${input.participantId} não encontrado.`,
      );
    }

    const previous = (participant.dyingState ?? "none") as DyingState;
    const next = input.state;

    if (previous === next) {
      return {
        participantId: input.participantId,
        previousState: previous,
        currentState: next,
        deathSavesReset: false,
        removedFromTurnOrder: this.isRemovedFromTurn(next),
      };
    }

    const allowed = VALID_TRANSITIONS[previous] ?? [];
    if (!allowed.includes(next)) {
      throw new DomainException(
        ErrorCode.DYING_STATE_TRANSITION_INVALID,
        `Transição '${previous}' → '${next}' não permitida.`,
        {
          context: { from: previous, to: next, reason: input.reason },
          hint: "RAW: stable→none requer HP > 0. dead→none só via Revivify.",
        },
      );
    }


    if (previous === "stable" && next === "none") {
      const currentHp = participant.currentHp ?? 0;
      if (currentHp <= 0) {
        throw new DomainException(
          ErrorCode.DYING_STATE_REQUIRES_HP_RESTORE,
          "stable → none requer HP > 0. Apply healing primeiro.",
          { context: { participantId: input.participantId } },
        );
      }
    }




    participant.dyingState = next as "none" | "dying" | "stable" | "dead";

    if (next === "captured") {
      (participant as unknown as { dyingState: string }).dyingState =
        "captured";
    }



    const deathSavesReset = previous === "dying" && next !== "dying";

    await this.partRepo.save(participant);

    if (input.campaignId) {
      try {
        const envelope = this.factory.build({
          eventCategory: "EncounterEvent",
          eventType: "dying_state_changed",
          source: {
            service: "diad-backend",
            module: "DyingStateService.setState",
            traceId: input.traceId,
          },
          scope: {
            campaignId: input.campaignId,
            encounterId: input.encounterId ?? participant.encounterId,
          },
          payload: {
            participantId: input.participantId,
            previous,
            next,
            reason: input.reason,
          },
          narrativeDescriptor:
            input.narrativeDescriptor ?? this.defaultDescriptor(previous, next),
        });
        await this.eventBus.publish(envelope);
      } catch {

      }
    }

    return {
      participantId: input.participantId,
      previousState: previous,
      currentState: next,
      deathSavesReset,
      removedFromTurnOrder: this.isRemovedFromTurn(next),
    };
  }

  private isRemovedFromTurn(state: DyingState): boolean {
    return state === "dead" || state === "captured" || state === "dying";
  }

  private defaultDescriptor(from: DyingState, to: DyingState): string {
    if (to === "captured") return "Rendição: removido do turn order, refém.";
    if (to === "dead") return "Caído. Sem retorno sem Revivify.";
    if (to === "stable") return "Estabilizado: sem mais death saves.";
    if (to === "dying") return "Caído a 0HP, fazendo death saves.";
    if (from === "dead" && to === "none") return "Revivido: 1HP, consciente.";
    return `${from} → ${to}.`;
  }
}
