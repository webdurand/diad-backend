import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { EventListener } from "src/common/event-bus/event-bus.types";
import {
  EventCategory,
  EventEnvelope,
} from "src/common/event-bus/event-envelope.types";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { PhaseService } from "../services/phase.service";

@Injectable()
export class CompassScenesListener implements EventListener {
  readonly name = "CompassScenesListener";
  readonly categories: readonly EventCategory[] = ["NarrativeEvent"];

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly phaseService: PhaseService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(CompassScenesListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "scene_changed") return;
    if (await this.alreadyProcessed(envelope.eventId)) return;

    const sessionId = envelope.scope.sessionId;
    const locationId = this.getLocationId(envelope);
    if (!sessionId || !locationId) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    await this.sessionRepo.query(
      `
      UPDATE game_sessions
      SET
        scenes_at_current_location = CASE
          WHEN last_scene_location_id = $2 THEN scenes_at_current_location + 1
          ELSE 1
        END,
        last_scene_location_id = $2,
        updated_at = NOW()
      WHERE id = $1
      `,
      [sessionId, locationId],
    );
    this.phaseService.invalidateMainQuestCache(sessionId);
    await this.markProcessed(envelope.eventId);
  }

  private getLocationId(envelope: EventEnvelope): string | null {
    const locationId = envelope.payload?.locationId;
    return typeof locationId === "string" && locationId ? locationId : null;
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
      this.logger.warn("compass_scenes.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
