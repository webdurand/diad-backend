import { DialogueActionService } from "../dialogue-action.service";

describe("DialogueActionService", () => {
  const makeService = () => {
    const scene = {
      id: "scene-1",
      sessionId: "sess-1",
      locationId: "loc-1",
      poiId: "poi-1",
      currentInterlocutorNpcId: "npc-1",
    };
    const sceneService = {
      getActive: jest.fn().mockResolvedValue(scene),
      addNpcToScene: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ ...scene, currentInterlocutorNpcId: null }),
    };
    const sceneNpcRepo = {
      findOne: jest.fn().mockResolvedValue({
        sceneId: "scene-1",
        npcId: "npc-1",
        presenceRole: "present",
        npc: { id: "npc-1", name: "Vasco", title: null },
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const movementLockService = {
      setForActiveScene: jest.fn().mockResolvedValue({
        active: true,
        reason: "Conversa com Vasco em andamento.",
        exitActionLabel: "Sair da conversa",
        interlocutorNpcId: "npc-1",
        source: "system",
        createdAt: "2026-05-12T00:00:00.000Z",
      }),
      getActiveForSession: jest.fn().mockResolvedValue({
        sceneId: "scene-1",
        locationId: "loc-1",
        poiId: "poi-1",
        movementLock: {
          active: true,
          reason: "Conversa com Vasco em andamento.",
          exitActionLabel: "Sair da conversa",
          interlocutorNpcId: "npc-1",
          source: "system",
          createdAt: "2026-05-12T00:00:00.000Z",
        },
      }),
    };
    const service = new DialogueActionService(
      sceneService as any,
      sceneNpcRepo as any,
      movementLockService as any,
    );
    return { service, sceneService, sceneNpcRepo, movementLockService };
  };

  it("starts dialogue by promoting a present NPC and activating a system lock", async () => {
    const { service, sceneService, movementLockService } = makeService();

    const result = await service.start("sess-1", { npcId: "npc-1" });

    expect(sceneService.addNpcToScene).toHaveBeenCalledWith(
      "scene-1",
      "npc-1",
      "interlocutor",
    );
    expect(movementLockService.setForActiveScene).toHaveBeenCalledWith(
      "sess-1",
      expect.objectContaining({
        active: true,
        exitActionLabel: "Sair da conversa",
        interlocutorNpcId: "npc-1",
        source: "system",
      }),
    );
    expect(result).toMatchObject({
      status: "started",
      sceneId: "scene-1",
      npc: { id: "npc-1", name: "Vasco" },
    });
  });

  it("exits dialogue without changing location or POI", async () => {
    const { service, sceneService, sceneNpcRepo, movementLockService } = makeService();

    const result = await service.exit("sess-1");

    expect(movementLockService.setForActiveScene).toHaveBeenCalledWith("sess-1", {
      active: false,
    });
    expect(sceneNpcRepo.update).toHaveBeenCalledWith(
      { sceneId: "scene-1", presenceRole: "interlocutor" },
      { presenceRole: "present" },
    );
    expect(sceneService.update).toHaveBeenCalledWith("scene-1", {
      currentInterlocutorNpcId: null,
    });
    expect(result).toMatchObject({
      status: "exited",
      sceneId: "scene-1",
      locationId: "loc-1",
      poiId: "poi-1",
    });
  });
});
