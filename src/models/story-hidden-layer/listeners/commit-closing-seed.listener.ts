import { Injectable } from "@nestjs/common";
import type { EventListener } from "src/common/event-bus/event-bus.types";
import type { EventEnvelope } from "src/common/event-bus/event-envelope.types";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { CommitClosingSeedUseCase } from "../application/commit-closing-seed.use-case";
import { AgentClosingSeedPlannerService } from "../services/agent-closing-seed-planner.service";
import { StoryHiddenLayerEventPublisherService } from "../services/story-hidden-layer-event-publisher.service";
import { StoryHiddenLayerService } from "../services/story-hidden-layer.service";

@Injectable()
export class CommitClosingSeedListener implements EventListener {
  readonly name = "CommitClosingSeedListener";
  readonly categories = ["WorldEvent"] as const;

  constructor(
    private readonly repository: StoryHiddenLayerService,
    private readonly planner: AgentClosingSeedPlannerService,
    private readonly events: StoryHiddenLayerEventPublisherService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(CommitClosingSeedListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "phase_changed") return;
    const sessionId = envelope.scope.sessionId;
    if (!sessionId) return;
    const toPhase = recordOrEmpty(envelope.payload.toPhase);
    const phaseIndex = numberOrNull(toPhase.index);
    if (!phaseIndex) return;

    try {
      const useCase = new CommitClosingSeedUseCase({
        repository: this.repository,
        planner: this.planner,
        events: this.events,
      });
      await useCase.execute({
        sessionId,
        campaignId: envelope.scope.campaignId ?? null,
        phaseId: stringOrNull(toPhase.id),
        storyArcId: stringOrNull(toPhase.storyArcId),
        phaseIndex,
        traceId: envelope.source.traceId,
      });
    } catch (err) {
      this.logger.warn("closing_seed.commit_failed", {
        "event.id": envelope.eventId,
        "event.type": envelope.eventType,
        "trace.id": envelope.source.traceId,
        "error.type": err instanceof Error ? err.name : typeof err,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
