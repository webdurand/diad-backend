import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { EventListener } from "src/common/event-bus/event-bus.types";
import { EventCategory, EventEnvelope } from "src/common/event-bus/event-envelope.types";
import { PhaseService } from "../services/phase.service";

const HANDLED_EVENTS = new Set(["scene_changed", "mission_progress_advanced"]);

@Injectable()
export class MissionPullListener implements EventListener {
  readonly name = "MissionPullListener";
  readonly categories: readonly EventCategory[] = ["NarrativeEvent"];

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly phaseService: PhaseService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(MissionPullListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (!HANDLED_EVENTS.has(envelope.eventType)) return;
    if (await this.alreadyProcessed(envelope.eventId)) return;

    const sessionId = envelope.scope.sessionId;
    if (!sessionId) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    if (this.isMissionProgress(envelope)) {
      await this.sessionRepo.update(sessionId, { turnsSinceMissionProgress: 0 });
    } else {
      await this.sessionRepo.increment(
        { id: sessionId },
        "turnsSinceMissionProgress",
        1,
      );
    }
    this.phaseService.invalidateMainQuestCache(sessionId);

    await this.markProcessed(envelope.eventId);
  }

  private isMissionProgress(envelope: EventEnvelope): boolean {
    if (envelope.eventType === "mission_progress_advanced") return true;
    const payload = envelope.payload ?? {};
    return (
      payload.missionProgress === true ||
      payload.missionProgressAdvanced === true ||
      payload.objectiveProgressed === true
    );
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
      this.logger.warn("mission_pull.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
