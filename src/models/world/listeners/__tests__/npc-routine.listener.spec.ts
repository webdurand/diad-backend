import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { NpcRoutineListener } from "../npc-routine.listener";

describe("NpcRoutineListener", () => {
  it("migra NPC core atualizando currentPoiId e currentLocationId", async () => {
    const processedRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const session = {
      id: "session-1",
      campaignId: "campaign-1",
      status: "active",
    };
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue(session),
      find: jest.fn(),
    };
    const state = {
      id: "state-1",
      gameSessionId: "session-1",
      npcId: "npc-1",
      status: "alive",
      currentPoiId: "poi-old",
      currentLocationId: "loc-old",
      npc: {
        id: "npc-1",
        name: "Ari",
        profileDepth: "core",
        routineSlots: { afternoon: "poi-new" },
      },
    };
    const stateRepo = {
      find: jest.fn().mockResolvedValue([state]),
      save: jest.fn(async (value) => value),
    };
    const poiRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "poi-new",
        locationId: "loc-new",
        name: "Mercado",
      }),
    };
    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    const listener = new NpcRoutineListener(
      processedRepo as any,
      sessionRepo as any,
      stateRepo as any,
      poiRepo as any,
      eventBus as any,
      new EventEnvelopeFactory(undefined),
      { setContext: jest.fn(), warn: jest.fn() } as any,
    );

    await listener.handle(
      new EventEnvelopeFactory(undefined).build({
        eventCategory: "WorldEvent",
        eventType: "period_changed",
        source: {
          service: "diad-backend",
          module: "test",
          traceId: "11111111111111111111111111111111",
        },
        scope: { campaignId: "campaign-1", sessionId: "session-1" },
        payload: { timeOfDay: "afternoon" },
      }),
    );

    expect(stateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPoiId: "poi-new",
        currentLocationId: "loc-new",
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: "NarrativeEvent",
        eventType: "npc_moved",
        payload: expect.objectContaining({
          npcId: "npc-1",
          routineSlot: "afternoon",
          fromPoiId: "poi-old",
          toPoiId: "poi-new",
          fromLocationId: "loc-old",
          toLocationId: "loc-new",
        }),
      }),
    );
  });
});
