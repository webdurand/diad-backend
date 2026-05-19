import { CompassScenesListener } from "../compass-scenes.listener";
import { EventEnvelope } from "src/common/event-bus/event-envelope.types";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";
const LOCATION_ID = "44444444-4444-4444-8444-444444444444";

function makeEnvelope(payload: Record<string, unknown> = {}): EventEnvelope {
  return {
    eventId: EVENT_ID,
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
    payload: {
      locationId: LOCATION_ID,
      fromSceneId: null,
      toSceneId: "55555555-5555-4555-8555-555555555555",
      ...payload,
    },
    audiences: ["Director"],
  };
}

function makeListener(processed = false) {
  const processedRepo = {
    findOne: jest
      .fn()
      .mockResolvedValue(processed ? { id: "processed-1" } : null),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const sessionRepo = {
    query: jest.fn().mockResolvedValue([{ affected: 1 }]),
  };
  const phaseService = {
    invalidateMainQuestCache: jest.fn(),
  };
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
  };
  const listener = new CompassScenesListener(
    processedRepo as any,
    sessionRepo as any,
    phaseService as any,
    logger as any,
  );
  return { listener, processedRepo, sessionRepo, phaseService };
}

describe("CompassScenesListener", () => {
  it("atualiza cenas no mesmo local via UPDATE atômico e marca idempotência", async () => {
    const { listener, processedRepo, sessionRepo, phaseService } =
      makeListener();

    await listener.handle(makeEnvelope());

    expect(sessionRepo.query).toHaveBeenCalledWith(
      expect.stringContaining("scenes_at_current_location"),
      [SESSION_ID, LOCATION_ID],
    );
    expect(processedRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        listenerName: "CompassScenesListener",
        eventId: EVENT_ID,
      }),
    );
    expect(phaseService.invalidateMainQuestCache).toHaveBeenCalledWith(
      SESSION_ID,
    );
  });

  it("não reprocessa evento já visto", async () => {
    const { listener, sessionRepo, processedRepo } = makeListener(true);

    await listener.handle(makeEnvelope());

    expect(sessionRepo.query).not.toHaveBeenCalled();
    expect(processedRepo.save).not.toHaveBeenCalled();
  });
});
