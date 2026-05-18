import { EvaluateNaturalLanguageTriggerListener } from "../listeners/evaluate-natural-language-trigger.listener";
import type { EventEnvelope } from "src/common/event-bus/event-envelope.types";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";

describe("EvaluateNaturalLanguageTriggerListener", () => {
  it("evaluates natural language triggers every 5 scenes", async () => {
    const narrativeMemory = { evaluateNaturalLanguageTriggers: jest.fn() };
    const listener = makeListener(narrativeMemory);

    await listener.handle(makeEnvelope(5));

    expect(
      narrativeMemory.evaluateNaturalLanguageTriggers,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        campaignId: CAMPAIGN_ID,
        sceneNumber: 5,
      }),
    );
  });

  it("skips scenes outside the cadence", async () => {
    const narrativeMemory = { evaluateNaturalLanguageTriggers: jest.fn() };
    const listener = makeListener(narrativeMemory);

    await listener.handle(makeEnvelope(4));

    expect(
      narrativeMemory.evaluateNaturalLanguageTriggers,
    ).not.toHaveBeenCalled();
  });
});

function makeListener(narrativeMemory: {
  evaluateNaturalLanguageTriggers: jest.Mock;
}) {
  return new EvaluateNaturalLanguageTriggerListener(
    {
      findOne: jest.fn(async () => null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    } as any,
    narrativeMemory as any,
    {
      setContext: jest.fn(),
      warn: jest.fn(),
    } as any,
  );
}

function makeEnvelope(sceneNumber: number): EventEnvelope {
  return {
    eventId: "33333333-3333-4333-8333-333333333333",
    version: 1,
    aggregateId: SESSION_ID,
    timestamp: new Date().toISOString(),
    eventCategory: "NarrativeEvent",
    eventType: "scene_changed",
    source: {
      service: "diad-backend",
      module: "test",
      traceId: "0af7651916cd43dd8448eb211c80319c",
    },
    scope: { campaignId: CAMPAIGN_ID, sessionId: SESSION_ID },
    payload: { sceneNumber },
    audiences: ["Director"],
  };
}
