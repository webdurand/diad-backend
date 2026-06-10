import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import type { EventListener } from "src/common/event-bus/event-bus.types";
import type { EventEnvelope } from "src/common/event-bus/event-envelope.types";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { NarrativeMemoryService } from "../services/narrative-memory.service";

const SCENE_INTERVAL = 5;

@Injectable()
export class EvaluateNaturalLanguageTriggerListener implements EventListener {
  readonly name = "EvaluateNaturalLanguageTriggerListener";
  readonly categories = ["NarrativeEvent"] as const;

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    private readonly narrativeMemory: NarrativeMemoryService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(EvaluateNaturalLanguageTriggerListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "scene_changed") return;
    if (await this.alreadyProcessed(envelope.eventId)) return;

    const sessionId = envelope.scope.sessionId;
    const campaignId = envelope.scope.campaignId;
    const sceneNumber = numberOrNull(envelope.payload.sceneNumber);
    if (!sessionId || !campaignId || !sceneNumber) {
      await this.markProcessed(envelope.eventId);
      return;
    }
    if (sceneNumber % SCENE_INTERVAL !== 0) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    try {
      await this.narrativeMemory.evaluateNaturalLanguageTriggers({
        sessionId,
        campaignId,
        sceneNumber,
        traceId: envelope.source.traceId,
      });
      await this.markProcessed(envelope.eventId);
    } catch (err) {
      this.logger.warn("narrative_memory.nl_trigger_evaluation_failed", {
        "event.id": envelope.eventId,
        "session.id": sessionId,
        "scene.number": sceneNumber,
        "error.message": err instanceof Error ? err.message : String(err),
      });
      await this.markProcessed(envelope.eventId);
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
      this.logger.warn("nl_trigger.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
