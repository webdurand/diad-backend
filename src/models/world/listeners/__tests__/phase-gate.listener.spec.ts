import { PhaseGateListener } from "../phase-gate.listener";
import { EventEnvelope } from "src/common/event-bus/event-envelope.types";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";

function makeEnvelope(eventType: string): EventEnvelope {
  return {
    eventId: EVENT_ID,
    version: 1,
    aggregateId: SESSION_ID,
    timestamp: new Date().toISOString(),
    eventCategory:
      eventType === "encounter_ended" ? "EncounterEvent" : "NarrativeEvent",
    eventType,
    source: {
      service: "diad-backend",
      module: "test",
      traceId: "b".repeat(32),
    },
    scope: { campaignId: CAMPAIGN_ID, sessionId: SESSION_ID },
    payload: {},
    audiences: ["Director"],
  };
}

function makeListener() {
  const processedRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const phaseService = {
    publishPendingPhaseGateIfUnlocked: jest.fn().mockResolvedValue({
      sessionId: SESSION_ID,
    }),
  };
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
  };
  const listener = new PhaseGateListener(
    processedRepo as any,
    phaseService as any,
    logger as any,
  );
  return { listener, processedRepo, phaseService };
}

describe("PhaseGateListener", () => {
  it("reavalia gate em encounter_ended", async () => {
    const { listener, phaseService, processedRepo } = makeListener();

    await listener.handle(makeEnvelope("encounter_ended"));

    expect(phaseService.publishPendingPhaseGateIfUnlocked).toHaveBeenCalledWith(
      SESSION_ID,
      "b".repeat(32),
    );
    expect(processedRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        listenerName: "PhaseGateListener",
        eventId: EVENT_ID,
      }),
    );
  });

  it("ignora eventos narrativos fora do contrato", async () => {
    const { listener, phaseService, processedRepo } = makeListener();

    await listener.handle(makeEnvelope("scene_changed"));

    expect(phaseService.publishPendingPhaseGateIfUnlocked).not.toHaveBeenCalled();
    expect(processedRepo.save).not.toHaveBeenCalled();
  });
});
