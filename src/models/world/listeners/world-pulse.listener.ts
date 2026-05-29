import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventListenerProcessedEntity } from "src/entities";
import { EventListener } from "src/common/event-bus/event-bus.types";
import {
  EventCategory,
  EventEnvelope,
} from "src/common/event-bus/event-envelope.types";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { WorldPulseService } from "../services/world-pulse.service";

const HANDLED_EVENTS = new Set([
  "scene_changed",
  "mission_progress_advanced",
  "period_changed",
]);

@Injectable()
export class WorldPulseListener implements EventListener {
  readonly name = "WorldPulseListener";
  readonly categories: readonly EventCategory[] = [
    "NarrativeEvent",
    "WorldEvent",
  ];

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    private readonly worldPulse: WorldPulseService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(WorldPulseListener.name);
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
      await this.worldPulse.evaluate({
        sessionId,
        traceId: envelope.source.traceId,
      });
    } catch (err) {
      this.logger.warn("world_pulse.evaluate_failed", {
        "event.id": envelope.eventId,
        "event.type": envelope.eventType,
        "session.id": sessionId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }

    await this.markProcessed(envelope.eventId);
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
      this.logger.warn("world_pulse.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
