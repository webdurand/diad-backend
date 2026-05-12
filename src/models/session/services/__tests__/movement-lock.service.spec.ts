import { MovementLockService } from "../movement-lock.service";

describe("MovementLockService", () => {
  const makeService = (scene: any = { id: "scene-1", contextSnapshot: {} }) => {
    const sceneRepo = {
      findOne: jest.fn().mockResolvedValue(scene),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const contextCache = {
      invalidate: jest.fn(),
    };
    const service = new MovementLockService(
      sceneRepo as any,
      contextCache as any,
    );
    return { service, sceneRepo, contextCache };
  };

  it("normalizes active movement locks with defaults", () => {
    const { service } = makeService();

    expect(service.normalize({ active: true })).toMatchObject({
      active: true,
      reason: "Conversa importante em andamento.",
      exitActionLabel: "Encerrar conversa",
      source: "director",
    });
  });

  it("writes movement lock into active scene snapshot and invalidates cache", async () => {
    const { service, sceneRepo, contextCache } = makeService({
      id: "scene-1",
      contextSnapshot: { foo: "bar" },
    });

    const lock = await service.setForActiveScene("sess-1", {
      active: true,
      reason: "O capitão exige resposta.",
      exitActionLabel: "Encerrar conversa",
      interlocutorNpcId: "npc-1",
      source: "director",
    });

    expect(lock).toMatchObject({
      active: true,
      reason: "O capitão exige resposta.",
      exitActionLabel: "Encerrar conversa",
      interlocutorNpcId: "npc-1",
      source: "director",
    });
    expect(sceneRepo.update).toHaveBeenCalledWith("scene-1", {
      contextSnapshot: expect.objectContaining({
        foo: "bar",
        movementLock: expect.objectContaining({
          reason: "O capitão exige resposta.",
        }),
      }),
    });
    expect(contextCache.invalidate).toHaveBeenCalledWith("scene-1");
  });

  it("clears movement lock from active scene snapshot", async () => {
    const { service, sceneRepo, contextCache } = makeService({
      id: "scene-1",
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
  });
});
