import { Injectable } from "@nestjs/common";
import type { EventListener } from "src/common/event-bus/event-bus.types";
import type { EventEnvelope } from "src/common/event-bus/event-envelope.types";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { NarrativeMemoryService } from "../services/narrative-memory.service";

@Injectable()
export class TierChronicleEntriesListener implements EventListener {
  readonly name = "TierChronicleEntriesListener";
  readonly categories = ["WorldEvent"] as const;

  constructor(
    private readonly narrativeMemory: NarrativeMemoryService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(TierChronicleEntriesListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "phase_changed") return;
    const sessionId = envelope.scope.sessionId;
    const campaignId = envelope.scope.campaignId;
    const fromPhaseIndex = numberOrNull(
      record(envelope.payload.fromPhase).index,
    );
    const toPhaseIndex = numberOrNull(record(envelope.payload.toPhase).index);
    if (!sessionId || !campaignId || !fromPhaseIndex || !toPhaseIndex) return;

    try {
      await this.narrativeMemory.tierChronicleEntries({
        sessionId,
        campaignId,
        fromPhaseIndex,
        toPhaseIndex,
        traceId: envelope.source.traceId,
      });
    } catch (err) {
      this.logger.warn("narrative_memory.tier_chronicle_failed", {
        "event.id": envelope.eventId,
        "session.id": sessionId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
