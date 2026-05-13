import { MovementLockService } from "../movement-lock.service";

describe("MovementLockService", () => {
  const makeService = (
    scene: any = {
      id: "scene-1",
      sessionId: "sess-1",
      locationId: "loc-1",
      poiId: "poi-1",
      contextSnapshot: {},
    },
  ) => {
    const sceneRepo = {
      findOne: jest.fn().mockResolvedValue(scene),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const contextCache = {
      invalidate: jest.fn(),
    };
    const eventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const envelopeFactory = {
      build: jest.fn((payload) => ({
        eventId: "evt-1",
        version: 1,
        aggregateId: payload.scope.sessionId,
        timestamp: "2026-05-12T00:00:00.000Z",
        ...payload,
        source: {
          traceId: "trace-1",
          ...payload.source,
        },
      })),
    };
    const service = new MovementLockService(
      sceneRepo as any,
      contextCache as any,
      eventBus as any,
      envelopeFactory as any,
    );
    return { service, sceneRepo, contextCache, eventBus, envelopeFactory };
  };

  it("normalizes active movement locks with defaults", () => {
    const { service } = makeService();

    expect(service.normalize({ active: true })).toMatchObject({
      active: true,
      reason: "Conversa importante em andamento.",
      exitActionLabel: "Sair da conversa",
      source: "director",
    });
  });

  it("derives an active lock from the scene interlocutor when snapshot lock is missing", async () => {
    const { service } = makeService({
      id: "scene-1",
      sessionId: "sess-1",
      locationId: "loc-1",
      poiId: "poi-1",
      currentInterlocutorNpcId: "npc-1",
      contextSnapshot: {},
    });

    const activeLock = await service.getActiveForSession("sess-1");

    expect(activeLock).toMatchObject({
      sceneId: "scene-1",
      locationId: "loc-1",
      poiId: "poi-1",
      movementLock: {
        active: true,
        reason: "Conversa importante em andamento.",
        exitActionLabel: "Sair da conversa",
        interlocutorNpcId: "npc-1",
        source: "system",
        anchor: {
          sceneId: "scene-1",
          locationId: "loc-1",
          poiId: "poi-1",
          interlocutorNpcId: "npc-1",
        },
      },
    });
  });

  it("writes movement lock into active scene snapshot and invalidates cache", async () => {
    const { service, sceneRepo, contextCache } = makeService({
      id: "scene-1",
      sessionId: "sess-1",
      locationId: "loc-1",
      poiId: "poi-1",
      contextSnapshot: { foo: "bar" },
    });

    const lock = await service.setForActiveScene("sess-1", {
      active: true,
      reason: "O capitão exige resposta.",
      exitActionLabel: "Sair da conversa",
      interlocutorNpcId: "npc-1",
      source: "director",
    });

    expect(lock).toMatchObject({
      active: true,
      reason: "O capitão exige resposta.",
      exitActionLabel: "Sair da conversa",
      interlocutorNpcId: "npc-1",
      source: "director",
    });
    expect(sceneRepo.update).toHaveBeenCalledWith("scene-1", {
      contextSnapshot: expect.objectContaining({
        foo: "bar",
        movementLock: expect.objectContaining({
          reason: "O capitão exige resposta.",
          anchor: {
            sceneId: "scene-1",
            locationId: "loc-1",
            poiId: "poi-1",
            interlocutorNpcId: "npc-1",
          },
        }),
      }),
    });
    expect(contextCache.invalidate).toHaveBeenCalledWith("scene-1");
  });

  it("clears movement lock from active scene snapshot", async () => {
    const { service, sceneRepo, contextCache, eventBus } = makeService({
      id: "scene-1",
      sessionId: "sess-1",
      locationId: "loc-1",
      poiId: "poi-1",
      contextSnapshot: {
        foo: "bar",
        movementLock: { active: true, reason: "X" },
      },
    });

    const lock = await service.setForActiveScene("sess-1", { active: false });

    expect(lock).toBeNull();
    expect(sceneRepo.update).toHaveBeenCalledWith("scene-1", {
      contextSnapshot: { foo: "bar" },
    });
    expect(contextCache.invalidate).toHaveBeenCalledWith("scene-1");
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: "NarrativeEvent",
        eventType: "movement_lock_changed",
        audiences: ["HUD"],
        payload: expect.objectContaining({
          activeBefore: true,
          activeAfter: false,
          sceneId: "scene-1",
          locationId: "loc-1",
          poiId: "poi-1",
        }),
      }),
    );
  });
});
