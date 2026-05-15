import { MissionPullListener } from "../mission-pull.listener";
import { EventEnvelope } from "src/common/event-bus/event-envelope.types";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";

function makeEnvelope(
  eventType: "scene_changed" | "mission_progress_advanced",
): EventEnvelope {
  return {
    eventId: EVENT_ID,
    version: 1,
    aggregateId: SESSION_ID,
    timestamp: new Date().toISOString(),
    eventCategory: "NarrativeEvent",
    eventType,
    source: {
      service: "diad-backend",
      module: "test",
      traceId: "a".repeat(32),
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
  const sessionRepo = {
    increment: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
  };
  const phaseService = {
    invalidateMainQuestCache: jest.fn(),
  };
  const listener = new MissionPullListener(
    processedRepo as any,
    sessionRepo as any,
    phaseService as any,
    logger as any,
  );
  return { listener, processedRepo, sessionRepo, phaseService };
}

describe("MissionPullListener", () => {
  it("incrementa turnsSinceMissionProgress em scene_changed sem progresso", async () => {
    const { listener, sessionRepo, processedRepo, phaseService } = makeListener();

    await listener.handle(makeEnvelope("scene_changed"));

    expect(sessionRepo.increment).toHaveBeenCalledWith(
      { id: SESSION_ID },
      "turnsSinceMissionProgress",
      1,
    );
    expect(processedRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        listenerName: "MissionPullListener",
        eventId: EVENT_ID,
      }),
    );
    expect(phaseService.invalidateMainQuestCache).toHaveBeenCalledWith(
      SESSION_ID,
    );
  });

  it("reseta turnsSinceMissionProgress em mission_progress_advanced", async () => {
    const { listener, sessionRepo, phaseService } = makeListener();

    await listener.handle(makeEnvelope("mission_progress_advanced"));

    expect(sessionRepo.update).toHaveBeenCalledWith(SESSION_ID, {
      turnsSinceMissionProgress: 0,
    });
    expect(phaseService.invalidateMainQuestCache).toHaveBeenCalledWith(
      SESSION_ID,
    );
  });
});
