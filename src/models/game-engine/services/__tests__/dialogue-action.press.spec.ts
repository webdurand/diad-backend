import { DialogueActionService } from "../dialogue-action.service";

function makeService(overrides: Record<string, any> = {}) {
  return new DialogueActionService(
    overrides.sceneService as any,
    overrides.sceneNpcRepo as any,
    (overrides.movementLockService ?? {
      getActiveForSession: jest.fn().mockResolvedValue({
        sceneId: "scene-1",
        movementLock: { interlocutorNpcId: "npc-1" },
      }),
      setForActiveScene: jest.fn(),
    }) as any,
    (overrides.eventBus ?? { publish: jest.fn() }) as any,
    (overrides.envelopeFactory ?? { build: jest.fn((value) => value) }) as any,
  );
}

describe("DialogueActionService press", () => {
  it("emite dialogue_reveal quando pressiona NPC com knowledgeScope nao revelado", async () => {
    const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    const envelopeFactory = { build: jest.fn((value) => value) };
    const service = makeService({
      sceneService: {
        getActive: jest.fn().mockResolvedValue({
          id: "scene-1",
          sessionId: "session-1",
          locationId: "loc-1",
          poiId: "poi-1",
          currentInterlocutorNpcId: "npc-1",
        }),
      },
      sceneNpcRepo: {
        findOne: jest.fn().mockResolvedValue({
          npcId: "npc-1",
          npc: {
            id: "npc-1",
            name: "Goma",
            knowledgeScope: ["rumor_amulet"],
          },
        }),
      },
      eventBus,
      envelopeFactory,
    });

    const result = await service.press("session-1", {
      npcId: "npc-1",
      topic: "rumor_amulet",
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "revealed",
        topic: "rumor_amulet",
        npcId: "npc-1",
      }),
    );
    expect(envelopeFactory.build).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "dialogue_reveal",
        payload: expect.objectContaining({
          triggeredBy: "press_for_more",
          topic: "rumor_amulet",
        }),
      }),
    );
    expect(eventBus.publish).toHaveBeenCalled();
  });
});
