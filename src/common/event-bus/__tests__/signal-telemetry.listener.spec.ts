import { SignalTelemetryListener } from "../listeners/signal-telemetry.listener";
import type { EventEnvelope } from "../event-envelope.types";

function makeEnvelope(
  eventType: string,
  payload: Record<string, unknown>,
): EventEnvelope {
  return {
    eventId: `event-${Math.random()}`,
    version: 1,
    aggregateId: "session-1",
    timestamp: "2026-05-19T12:00:00.000Z",
    eventCategory: "NarrativeEvent",
    eventType,
    source: {
      service: "diad-agents",
      module: "test",
      traceId: "0af7651916cd43dd8448eb211c80319c",
    },
    scope: {
      campaignId: "campaign-1",
      sessionId: "session-1",
    },
    payload,
    audiences: ["HUD"],
  };
}

function makeLogger() {
  return {
    setContext: jest.fn(),
    warn: jest.fn(),
  };
}

describe("SignalTelemetryListener", () => {
  it("emite warn quando beacon_pct passa de 30% por sessão", async () => {
    const logger = makeLogger();
    const listener = new SignalTelemetryListener(logger as never);

    await listener.handle(
      makeEnvelope("compass_signal_emitted", { beaconEmitted: false }),
    );
    await listener.handle(
      makeEnvelope("compass_signal_emitted", { beaconEmitted: true }),
    );

    expect(logger.warn).toHaveBeenCalledWith(
      "signal.telemetry_beacon_ratio_high",
      expect.objectContaining({
        "session.id": "session-1",
        "signal.type": "compass",
        "signal.emitted_count": 1,
        "signal.sample_count": 2,
      }),
    );
  });

  it("emite warn quando combat_trigger_pct passa de 25% por sessão", async () => {
    const logger = makeLogger();
    const listener = new SignalTelemetryListener(logger as never);

    await listener.handle(
      makeEnvelope("combat_intent_signal_emitted", {
        isCombatTriggerEmitted: false,
      }),
    );
    await listener.handle(
      makeEnvelope("combat_intent_signal_emitted", {
        isCombatTriggerEmitted: false,
      }),
    );
    await listener.handle(
      makeEnvelope("combat_intent_signal_emitted", {
        isCombatTriggerEmitted: true,
      }),
    );

    expect(logger.warn).toHaveBeenCalledWith(
      "signal.telemetry_combat_trigger_ratio_high",
      expect.objectContaining({
        "session.id": "session-1",
        "signal.type": "combat_intent",
        "signal.emitted_count": 1,
        "signal.sample_count": 3,
      }),
    );
  });

  it("mantém janela rolante de 50 eventos", async () => {
    const logger = makeLogger();
    const listener = new SignalTelemetryListener(logger as never);

    await listener.handle(
      makeEnvelope("compass_signal_emitted", { beaconEmitted: true }),
    );
    logger.warn.mockClear();

    for (let i = 0; i < 50; i++) {
      await listener.handle(
        makeEnvelope("compass_signal_emitted", { beaconEmitted: false }),
      );
    }
    await listener.handle(
      makeEnvelope("compass_signal_emitted", { beaconEmitted: true }),
    );

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
