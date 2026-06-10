import { Injectable } from "@nestjs/common";
import type { EventListener } from "src/common/event-bus/event-bus.types";
import type { EventEnvelope } from "src/common/event-bus/event-envelope.types";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { NarrativeMemoryService } from "../services/narrative-memory.service";

@Injectable()
export class EvolveDowntimeListener implements EventListener {
  readonly name = "EvolveDowntimeListener";
  readonly categories = ["WorldEvent"] as const;

  constructor(
    private readonly narrativeMemory: NarrativeMemoryService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(EvolveDowntimeListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "phase_changed") return;
    const sessionId = envelope.scope.sessionId;
    const campaignId = envelope.scope.campaignId;
    const phaseTransitionId = stringOrNull(envelope.payload.phaseTransitionId);
    const chaosFactor = numberOrNull(envelope.payload.chaosFactor) ?? 5;
    if (!sessionId || !campaignId || !phaseTransitionId) return;

    try {
      await this.narrativeMemory.evolveDowntime({
        sessionId,
        campaignId,
        phaseTransitionId,
        chaosFactor,
        traceId: envelope.source.traceId,
      });
    } catch (err) {
      this.logger.warn("narrative_memory.downtime_failed", {
        "event.id": envelope.eventId,
        "session.id": sessionId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
