import { FocalSwapService } from "../focal-swap.service";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

const SCENE_ID = "scene-1";
const SESSION_ID = "session-1";

function buildService(opts: { socialCollective: boolean; sceneNpcExists?: boolean }) {
  const manager = {
    findOne: jest
      .fn()
      .mockResolvedValueOnce({
        id: SCENE_ID,
        sessionId: SESSION_ID,
        socialCollective: opts.socialCollective,
        currentInterlocutorNpcId: "npc-old",
      })
      .mockResolvedValueOnce(
      opts.sceneNpcExists === false
        ? null
        : { sceneId: SCENE_ID, npcId: "npc-new", presenceRole: "present" },
      ),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: jest.fn(async (cb: any) => cb(manager)),
  };
  const cache = { invalidate: jest.fn() };
  const eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
  const envelopeFactory = { build: jest.fn((input) => input) };
  const service = new FocalSwapService(
    dataSource as any,
    cache as any,
    eventBus as any,
    envelopeFactory as any,
  );
  return { service, dataSource, manager, cache, eventBus };
}

describe("FocalSwapService", () => {
  it("troca focal em cena coletiva sem sair de dialogue", async () => {
    const { service, dataSource, manager, cache, eventBus } = buildService({
      socialCollective: true,
    });

    const result = await service.swap(SCENE_ID, "npc-new", "char-1");

    expect(result).toMatchObject({
      sceneId: SCENE_ID,
      previousFocalNpcId: "npc-old",
      newFocalNpcId: "npc-new",
    });
    expect(dataSource.transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(manager.update).toHaveBeenCalledWith(expect.any(Function), SCENE_ID, {
      currentInterlocutorNpcId: "npc-new",
    });
    expect(manager.update).toHaveBeenCalledWith(
      expect.any(Function),
      { sceneId: SCENE_ID, presenceRole: "interlocutor" },
      { presenceRole: "present" },
    );
    expect(manager.update).toHaveBeenCalledWith(
      expect.any(Function),
      { sceneId: SCENE_ID, npcId: "npc-new" },
      { presenceRole: "interlocutor" },
    );
    expect(cache.invalidate).toHaveBeenCalledWith(SCENE_ID);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "dialogue_focal_swapped" }),
    );
  });

  it("rejeita quando socialCollective=false", async () => {
    const { service } = buildService({ socialCollective: false });

    await expect(service.swap(SCENE_ID, "npc-new", "char-1")).rejects.toMatchObject({
      code: ErrorCode.SESSION_SOCIAL_COLLECTIVE_REQUIRED,
    });
  });

  it("rejeita NPC ausente da cena", async () => {
    const { service } = buildService({
      socialCollective: true,
      sceneNpcExists: false,
    });

    await expect(service.swap(SCENE_ID, "npc-new", "char-1")).rejects.toMatchObject({
      code: ErrorCode.NPC_FOCAL_NOT_IN_SCENE,
    });
  });
});
