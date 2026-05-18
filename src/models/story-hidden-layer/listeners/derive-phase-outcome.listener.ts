import { Injectable } from "@nestjs/common";
import type { EventListener } from "src/common/event-bus/event-bus.types";
import type { EventEnvelope } from "src/common/event-bus/event-envelope.types";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { StoryHiddenLayerService } from "../services/story-hidden-layer.service";

@Injectable()
export class DerivePhaseOutcomeListener implements EventListener {
  readonly name = "DerivePhaseOutcomeListener";
  readonly categories = ["NarrativeEvent"] as const;

  constructor(
    private readonly hiddenLayer: StoryHiddenLayerService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(DerivePhaseOutcomeListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "phase_completed") return;
    const sessionId = envelope.scope.sessionId;
    const phaseTransitionId = stringOrNull(envelope.payload.phaseTransitionId);
    if (!sessionId || !phaseTransitionId) return;

    try {
      await this.hiddenLayer.deriveOutcomeForPhaseCompleted({
        sessionId,
        campaignId: envelope.scope.campaignId ?? null,
        phaseTransitionId,
        traceId: envelope.source.traceId,
      });
    } catch (err) {
      this.logger.warn("phase_outcome.derive_failed", {
        "event.id": envelope.eventId,
        "event.type": envelope.eventType,
        "trace.id": envelope.source.traceId,
        "error.type": err instanceof Error ? err.name : typeof err,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
