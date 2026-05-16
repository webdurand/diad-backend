import { SceneService } from "../scene.service";

function buildService(maxSceneNumber: string) {
  const sceneRepo = {
    findOne: jest.fn().mockResolvedValueOnce(null),
    update: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((data: any) => ({ ...data, id: "scene-new" })),
    save: jest.fn(async (entity: any) => entity),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: maxSceneNumber }),
    })),
  };
  const sessionRepo = {
    findOne: jest.fn().mockResolvedValue({ id: "session-1", campaignId: "campaign-1" }),
  };
  const campaignRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: "campaign-1",
      contentBudget: { maxScenes: 12 },
      arcState: { currentBeat: "YOU", beatEnteredAtScene: 1, transitionHistory: [] },
      questionAnswered: false,
      currentCounts: { scenes: 0 },
    }),
    save: jest.fn(async (campaign: any) => campaign),
  };
  const coldOpen = { execute: jest.fn().mockResolvedValue({ archetypeKey: "in_medias_res" }) };

  const service = new SceneService(
    sceneRepo as any,
    {} as any,
    sessionRepo as any,
    campaignRepo as any,
    { incrementCount: jest.fn().mockResolvedValue(undefined) } as any,
    { invalidate: jest.fn() } as any,
    { publish: jest.fn().mockResolvedValue(undefined) } as any,
    { build: jest.fn((x: any) => x) } as any,
    { setContext: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    { upsert: jest.fn().mockResolvedValue(undefined) } as any,
    { ensureDefaultForLocation: jest.fn().mockResolvedValue({ id: "poi-1" }) } as any,
    coldOpen as any,
  );

  return { service, coldOpen };
}

describe("SceneService.create cold open", () => {
  it("triggers cold open hook generation for sceneNumber=1", async () => {
    const { service, coldOpen } = buildService("0");

    await service.create("session-1", { title: "Abertura" });

    expect(coldOpen.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: "scene-new", sceneNumber: 1 }),
    );
  });

  it("does not trigger cold open hook generation for sceneNumber=2", async () => {
    const { service, coldOpen } = buildService("1");

    await service.create("session-1", { title: "Cena 2" });

    expect(coldOpen.execute).not.toHaveBeenCalled();
  });
});
