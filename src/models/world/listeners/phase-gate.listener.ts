import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { EventListener } from "src/common/event-bus/event-bus.types";
import { EventCategory, EventEnvelope } from "src/common/event-bus/event-envelope.types";
import { PhaseService } from "../services/phase.service";

// Qualquer evento que possa satisfazer condição de gate reavalia o gate —
// com só encounter_ended/decision o gate ficava preso mesmo após a condição
// real (quest, clock, visita, progresso de missão) ter acontecido.
const HANDLED_EVENTS = new Set([
  "encounter_ended",
  "narrative_decision_made",
  "quest_completed",
  "objective_completed",
  "clock_filled",
  "location_visited",
  "mission_progress_advanced",
]);

@Injectable()
export class PhaseGateListener implements EventListener {
  readonly name = "PhaseGateListener";
  readonly categories: readonly EventCategory[] = [
    "EncounterEvent",
    "NarrativeEvent",
    "WorldEvent",
  ];

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    private readonly phaseService: PhaseService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(PhaseGateListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (!HANDLED_EVENTS.has(envelope.eventType)) return;
    if (await this.alreadyProcessed(envelope.eventId)) return;

    const sessionId = envelope.scope.sessionId;
    if (!sessionId) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    try {
      await this.phaseService.publishPendingPhaseGateIfUnlocked(
        sessionId,
        envelope.source.traceId,
      );
      await this.markProcessed(envelope.eventId);
    } catch (err) {
      if (err instanceof NotFoundException) {
        await this.markProcessed(envelope.eventId);
        return;
      }
      this.logger.warn("phase_gate.evaluate_failed", {
        "event.id": envelope.eventId,
        "event.type": envelope.eventType,
        "session.id": sessionId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
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
      this.logger.warn("phase_gate.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
