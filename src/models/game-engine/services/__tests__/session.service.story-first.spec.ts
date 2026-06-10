import { SessionService } from "../session.service";

function makeService(overrides: Record<string, any> = {}): SessionService {
  const sessionRepo = overrides.sessionRepo ?? {};
  const campaignRepo = overrides.campaignRepo ?? {};
  const campaignPlayerRepo = overrides.campaignPlayerRepo ?? {};
  const characterRepo = overrides.characterRepo ?? {};
  const encounterRepo = overrides.encounterRepo ?? {};
  const locationRepo = overrides.locationRepo ?? { find: jest.fn().mockResolvedValue([]) };
  const npcRepo = overrides.npcRepo ?? { find: jest.fn().mockResolvedValue([]) };
  const npcStateRepo = overrides.npcStateRepo ?? {};
  const factionRepo = overrides.factionRepo ?? { find: jest.fn().mockResolvedValue([]) };
  const sceneService = overrides.sceneService ?? {};
  const questService = overrides.questService ?? {
    create: jest.fn().mockResolvedValue({ slug: "main" }),
    revealQuest: jest.fn().mockResolvedValue({}),
  };
  const phaseService = overrides.phaseService ?? {};
  const sessionNpcStateService = overrides.sessionNpcStateService ?? {
    listByPoi: jest.fn().mockResolvedValue([]),
  };
  const minimalWorldSeedService = overrides.minimalWorldSeedService ?? {
    ensureMinimalPlayableWorld: jest.fn().mockResolvedValue(null),
  };
  const logger = overrides.logger ?? {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };

  return new SessionService(
    sessionRepo as any,
    campaignRepo as any,
    campaignPlayerRepo as any,
    characterRepo as any,
    encounterRepo as any,
    locationRepo as any,
    npcRepo as any,
    npcStateRepo as any,
    factionRepo as any,
    sceneService as any,
    questService as any,
    phaseService as any,
    sessionNpcStateService as any,
    { ensureDefaultForLocation: jest.fn() } as any,
    minimalWorldSeedService as any,
    logger as any,
  );
}

describe("SessionService story-first bootstrap detection", () => {
  it("creates new sessions with bimodal and idle loop enabled by default", async () => {
    const sessionRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: "session-1", ...value })),
    };
    const service = makeService({ sessionRepo });

    await service.create("user-1", { name: "Mesa solo" });

    expect(sessionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          bimodalLoopEnabled: true,
          idleLoopEnabled: true,
          hubPoiEnabled: true,
        }),
      }),
    );
  });

  it("treats AI-generated story_arc campaigns as story-first", () => {
    const service = makeService();

    const result = (service as any).isStoryFirstCampaign({
      generationSeed: {
        aiAdditions: {
          story_arc: { name: "O Despertar Silencioso" },
        },
      },
    });

    expect(result).toBe(true);
  });

  it("materializes AI-generated quests when questsTemplate is absent", async () => {
    const questService = {
      create: jest.fn().mockResolvedValue({ slug: "ecos-da-unidade-perdida" }),
      revealQuest: jest.fn().mockResolvedValue({}),
    };
    const service = makeService({ questService });

    await (service as any).materializeQuestsFromTemplate("session-1", {
      id: "campaign-1",
      generationSeed: {
        aiAdditions: {
          quests: [
            {
              name: "Ecos da Unidade Perdida",
              description: "Investigar os sinais anômalos.",
              isMainQuest: true,
              objectives: [
                {
                  kind: "talk_to_npc",
                  targetName: "Tainara",
                  targetCity: "Valorheim",
                  description: "Conversar com Tainara sobre o ritual antigo.",
                },
              ],
            },
          ],
        },
      },
    });

    expect(questService.create).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        name: "Ecos da Unidade Perdida",
        isMainQuest: true,
        objectives: [
          expect.objectContaining({
            kind: "talk_to_npc",
            targetName: "Tainara",
            targetCity: "Valorheim",
          }),
        ],
      }),
    );
    expect(questService.revealQuest).toHaveBeenCalledWith(
      "session-1",
      "ecos-da-unidade-perdida",
      "Main quest revelada no início da aventura.",
    );
  });
});
