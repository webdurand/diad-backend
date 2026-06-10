import { Injectable } from "@nestjs/common";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { EventListener } from "../event-bus.types";
import {
  EventCategory,
  EventEnvelope,
} from "../event-envelope.types";

type SignalTelemetryType = "compass" | "combat_intent";

interface SignalTelemetrySample {
  type: SignalTelemetryType;
  emitted: boolean;
}

const WINDOW_SIZE = 50;
const BEACON_WARN_THRESHOLD = 0.3;
const COMBAT_TRIGGER_WARN_THRESHOLD = 0.25;

@Injectable()
export class SignalTelemetryListener implements EventListener {
  readonly name = "SignalTelemetryListener";
  readonly categories: readonly EventCategory[] = ["NarrativeEvent"];

  private readonly windows = new Map<string, SignalTelemetrySample[]>();
  private readonly warned = new Map<string, boolean>();

  constructor(private readonly logger: DiadLogger) {
    this.logger.setContext(SignalTelemetryListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    const sample = this.toSample(envelope);
    if (!sample) return;

    const sessionId = envelope.scope.sessionId;
    if (!sessionId) return;

    const window = this.windows.get(sessionId) ?? [];
    window.push(sample);
    if (window.length > WINDOW_SIZE) {
      window.splice(0, window.length - WINDOW_SIZE);
    }
    this.windows.set(sessionId, window);

    this.warnIfNeeded(sessionId, sample.type, window);
  }

  private toSample(envelope: EventEnvelope): SignalTelemetrySample | null {
    if (envelope.eventType === "compass_signal_emitted") {
      return {
        type: "compass",
        emitted: envelope.payload.beaconEmitted === true,
      };
    }
    if (envelope.eventType === "combat_intent_signal_emitted") {
      return {
        type: "combat_intent",
        emitted: envelope.payload.isCombatTriggerEmitted === true,
      };
    }
    return null;
  }

  private warnIfNeeded(
    sessionId: string,
    type: SignalTelemetryType,
    window: SignalTelemetrySample[],
  ): void {
    const samples = window.filter((sample) => sample.type === type);
    if (samples.length === 0) return;

    const emitted = samples.filter((sample) => sample.emitted).length;
    const ratio = emitted / samples.length;
    const threshold =
      type === "compass"
        ? BEACON_WARN_THRESHOLD
        : COMBAT_TRIGGER_WARN_THRESHOLD;
    const key = `${sessionId}:${type}`;
    const currentlyOver = ratio > threshold;
    const wasOver = this.warned.get(key) === true;

    if (currentlyOver && !wasOver) {
      this.warned.set(key, true);
      this.logger.warn(
        type === "compass"
          ? "signal.telemetry_beacon_ratio_high"
          : "signal.telemetry_combat_trigger_ratio_high",
        {
          "session.id": sessionId,
          "signal.type": type,
          "signal.emitted_count": emitted,
          "signal.sample_count": samples.length,
          "signal.emitted_pct": Math.round(ratio * 10000) / 100,
          "signal.threshold_pct": threshold * 100,
          "signal.window_size": WINDOW_SIZE,
        },
      );
      return;
    }

    if (!currentlyOver && wasOver) {
      this.warned.set(key, false);
    }
  }
}
