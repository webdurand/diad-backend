import { MissionPanelCacheListener } from "../mission-panel-cache.listener";
import { EventEnvelope } from "src/common/event-bus/event-envelope.types";

const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";

function makeEnvelope(eventType: string): EventEnvelope {
  return {
    eventId: "11111111-1111-4111-8111-111111111111",
    version: 1,
    aggregateId: SESSION_ID,
    timestamp: new Date().toISOString(),
    eventCategory: "WorldEvent",
    eventType,
    source: {
      service: "diad-backend",
      module: "test",
      traceId: "a".repeat(32),
    },
    scope: { campaignId: CAMPAIGN_ID, sessionId: SESSION_ID },
    payload: {},
    audiences: ["HUD"],
  };
}

describe("MissionPanelCacheListener", () => {
  it("invalidates main quest cache for story progression events", async () => {
    const phaseService = { invalidateMainQuestCache: jest.fn() };
    const listener = new MissionPanelCacheListener(phaseService as any);

    await listener.handle(makeEnvelope("phase_changed"));

    expect(phaseService.invalidateMainQuestCache).toHaveBeenCalledWith(
      SESSION_ID,
    );
  });

  it("ignores unrelated world events", async () => {
    const phaseService = { invalidateMainQuestCache: jest.fn() };
    const listener = new MissionPanelCacheListener(phaseService as any);

    await listener.handle(makeEnvelope("quest_revealed"));

    expect(phaseService.invalidateMainQuestCache).not.toHaveBeenCalled();
  });
});
