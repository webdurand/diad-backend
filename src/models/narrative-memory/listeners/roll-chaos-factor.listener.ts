import { Injectable } from "@nestjs/common";
import type { EventListener } from "src/common/event-bus/event-bus.types";
import type { EventEnvelope } from "src/common/event-bus/event-envelope.types";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import type { OutcomeTier } from "src/models/story-hidden-layer/domain/hidden-layer.types";
import { NarrativeMemoryService } from "../services/narrative-memory.service";

const OUTCOME_TIERS = new Set(["TRIUMPH", "BITTERSWEET", "COSTLY", "FAILURE"]);

@Injectable()
export class RollChaosFactorListener implements EventListener {
  readonly name = "RollChaosFactorListener";
  readonly categories = ["NarrativeEvent"] as const;

  constructor(
    private readonly narrativeMemory: NarrativeMemoryService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(RollChaosFactorListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "phase_outcome_derived") return;
    const sessionId = envelope.scope.sessionId;
    const outcomeTier = stringOrNull(envelope.payload.outcomeTier);
    if (!sessionId || !outcomeTier || !OUTCOME_TIERS.has(outcomeTier)) return;

    try {
      await this.narrativeMemory.rollChaosFactor({
        sessionId,
        outcomeTier: outcomeTier as OutcomeTier,
        traceId: envelope.source.traceId,
      });
    } catch (err) {
      this.logger.warn("narrative_memory.chaos_roll_failed", {
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
