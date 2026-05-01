import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import { NpcEntity } from "src/entities/npc.entity";
import { DiadLogger } from "../../observability/logger/diad-logger.service";
import { EventListener } from "../event-bus.types";
import { EventBusService } from "../event-bus.service";
import { EventEnvelopeFactory } from "../event-envelope.factory";
import {
  EventCategory,
  EventEnvelope,
} from "../event-envelope.types";

/**
 * Spec 027 (M2, AC2.5) — WitnessPropagationListener.
 *
 * Reage a `EncounterEvent.damage_applied` e `EncounterEvent.participant_died`.
 * Query NPCs em mesma `current_location_id` do alvo, com `status='alive'`.
 * Pra cada testemunha, emite `NarrativeEvent.npc_witnessed_event` com severity
 * derivada do tipo do evento original. ReputationListener e GuardDispatchListener
 * consomem o evento propagado.
 *
 * Severity mapping (BG3 Patch 7 + PF2e):
 *  - participant_died (lethal) → 3 (critical)
 *  - damage_applied + isLethal=true → 3
 *  - damage_applied + amount >= 10 → 2 (serious)
 *  - damage_applied default → 1 (soft)
 *
 * NÃO emite witness pro próprio attacker/victim. NÃO propaga se sceneId/locationId
 * faltarem (best-effort — sem location não há "witnesses presentes"). Idempotente
 * via `event_listener_processed`.
 */
@Injectable()
export class WitnessPropagationListener implements EventListener {
  readonly name = "WitnessPropagationListener";
  readonly categories: readonly EventCategory[] = ["EncounterEvent"];

  private static readonly TARGET_EVENT_TYPES = new Set([
    "damage_applied",
    "participant_died",
  ]);

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    @InjectRepository(NpcEntity)
    private readonly npcRepo: Repository<NpcEntity>,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(WitnessPropagationListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (!WitnessPropagationListener.TARGET_EVENT_TYPES.has(envelope.eventType)) {
      return;
    }
    if (await this.alreadyProcessed(envelope.eventId)) {
      return;
    }

    const locationId = this.resolveLocationId(envelope);
    if (!locationId) {
      // Sem location não há witnesses — early return (cenário válido em
      // testes unit ou eventos sintéticos).
      await this.markProcessed(envelope.eventId);
      return;
    }

    const perpetratorId = (envelope.payload?.attackerCharacterId ??
      envelope.payload?.attackerParticipantId ??
      null) as string | null;
    const victimId = (envelope.payload?.targetParticipantId ??
      envelope.payload?.participantId ??
      null) as string | null;

    const witnesses = await this.npcRepo.find({
      where: {
        campaignId: envelope.scope.campaignId,
        currentLocationId: locationId,
        status: "alive",
      },
      select: ["id", "currentLocationId"],
    });

    const filtered = witnesses.filter((npc) => {
      if (perpetratorId && npc.id === perpetratorId) return false;
      if (victimId && npc.id === victimId) return false;
      return true;
    });

    if (filtered.length === 0) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const severity = this.deriveSeverity(envelope);

    for (const witness of filtered) {
      try {
        const propagated = this.envelopeFactory.build({
          eventCategory: "NarrativeEvent",
          eventType: "npc_witnessed_event",
          source: {
            service: "diad-backend",
            module: "WitnessPropagationListener",
            traceId: envelope.source.traceId,
          },
          scope: {
            campaignId: envelope.scope.campaignId,
            sessionId: envelope.scope.sessionId,
            sceneId: envelope.scope.sceneId,
            encounterId: envelope.scope.encounterId,
          },
          aggregateId: witness.id,
          payload: {
            witnessId: witness.id,
            originalEvent: {
              eventId: envelope.eventId,
              eventCategory: envelope.eventCategory,
              eventType: envelope.eventType,
            },
            severity,
            locationId,
            occurredAt: envelope.timestamp,
            perpetratorId,
            victimId,
            context: {
              damageAmount: envelope.payload?.amount,
              isCritical: envelope.payload?.fromCriticalHit === true,
              isLethal:
                envelope.eventType === "participant_died" ||
                envelope.payload?.defeated === true,
            },
          },
          narrativeDescriptor:
            severity >= 3
              ? "Uma testemunha viu morte violenta."
              : severity === 2
              ? "Uma testemunha viu agressão séria."
              : "Uma testemunha viu o ataque.",
        });
        await this.eventBus.publish(propagated);
      } catch (err) {
        // Falha em emit não rollback — log e continua próximas testemunhas.
        this.logger.warn(
          "event_bus.witness_propagation.publish_failed",
          {
            "event.id": envelope.eventId,
            "witness.id": witness.id,
            "error.message": err instanceof Error ? err.message : String(err),
          },
        );
      }
    }

    await this.markProcessed(envelope.eventId);
  }

  private resolveLocationId(envelope: EventEnvelope): string | null {
    const payloadLoc =
      (envelope.payload?.locationId as string | undefined) ??
      (envelope.payload?.sceneLocationId as string | undefined);
    return payloadLoc ?? null;
  }

  private deriveSeverity(envelope: EventEnvelope): 1 | 2 | 3 {
    if (envelope.eventType === "participant_died") return 3;
    if (envelope.payload?.defeated === true) return 3;
    const amount = Number(envelope.payload?.amount ?? 0);
    if (amount >= 10) return 2;
    return 1;
  }

  private async alreadyProcessed(eventId: string): Promise<boolean> {
    const found = await this.processedRepo.findOne({
      where: { listenerName: this.name, eventId },
      select: ["id"],
    });
    return !!found;
  }

  private async markProcessed(eventId: string): Promise<void> {
    try {
      await this.processedRepo.save(
        this.processedRepo.create({ listenerName: this.name, eventId }),
      );
    } catch (err) {
      this.logger.warn("event_bus.witness_propagation.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
