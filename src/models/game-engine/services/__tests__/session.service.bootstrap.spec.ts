import { SessionService } from "../session.service";

function makeLogger() {
  return {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function makeService(overrides: Record<string, any> = {}): SessionService {
  return new SessionService(
    overrides.sessionRepo as any,
    overrides.campaignRepo as any,
    (overrides.campaignPlayerRepo ?? {}) as any,
    (overrides.characterRepo ?? {}) as any,
    (overrides.encounterRepo ?? {}) as any,
    (overrides.locationRepo ?? { find: jest.fn().mockResolvedValue([]) }) as any,
    (overrides.npcRepo ?? { find: jest.fn().mockResolvedValue([]) }) as any,
    (overrides.npcStateRepo ?? { find: jest.fn().mockResolvedValue([]) }) as any,
    (overrides.factionRepo ?? { find: jest.fn().mockResolvedValue([]) }) as any,
    overrides.sceneService as any,
    (overrides.questService ?? {
      create: jest.fn(),
      revealQuest: jest.fn(),
    }) as any,
    (overrides.phaseService ?? { bootstrapStoryFirst: jest.fn() }) as any,
    overrides.sessionNpcStateService as any,
    (overrides.poiService ?? {
      ensureDefaultForLocation: jest.fn(),
    }) as any,
    (overrides.logger ?? makeLogger()) as any,
  );
}

describe("SessionService bootstrap POI hub", () => {
  it("initializes canonical NPC states before creating the first scene", async () => {
    const order: string[] = [];
    const sessionRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: "session-1", ...value })),
    };
    const campaignRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "campaign-1",
        name: "Ilha do Diabo",
        startingLocationId: "loc-1",
        generationSeed: {},
      }),
      save: jest.fn(async (value) => value),
    };
    const npcRepo = {
      find: jest.fn(async () => {
        order.push("initializeCanonicalNpcStates");
        return [
          {
            id: "npc-1",
            homeLocationId: "loc-1",
            homePoiId: "poi-1",
          },
        ];
      }),
    };
    const npcStateRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const sceneService = {
      create: jest.fn(async () => {
        order.push("bootstrapInitialScene");
        return { id: "scene-1", poiId: "poi-1" };
      }),
      getSceneNpcs: jest.fn().mockResolvedValue([]),
      addNpcToScene: jest.fn().mockResolvedValue({}),
    };
    const sessionNpcStateService = {
      listByPoi: jest.fn().mockResolvedValue([
        { npcId: "npc-1", status: "alive" },
      ]),
    };

    const service = makeService({
      sessionRepo,
      campaignRepo,
      npcRepo,
      npcStateRepo,
      sceneService,
      sessionNpcStateService,
    });

    await service.create("user-1", {
      name: "Solo: Ilha",
      campaignId: "campaign-1",
    });

    expect(order).toEqual([
      "initializeCanonicalNpcStates",
      "bootstrapInitialScene",
    ]);
  });

  it("creates the first scene with locationId and populates present NPCs from the default POI", async () => {
    const sessionRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: "session-1", ...value })),
    };
    const campaignRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "campaign-1",
        name: "Ilha do Diabo",
        startingLocationId: "loc-1",
        generationSeed: {},
      }),
      save: jest.fn(async (value) => value),
    };
    const sceneService = {
      create: jest.fn().mockResolvedValue({
        id: "scene-1",
        locationId: "loc-1",
        poiId: "poi-1",
      }),
      getSceneNpcs: jest.fn().mockResolvedValue([]),
      addNpcToScene: jest.fn().mockResolvedValue({}),
    };
    const sessionNpcStateService = {
      listByPoi: jest.fn().mockResolvedValue([
        { npcId: "npc-1", status: "alive" },
        { npcId: "npc-dead", status: "dead" },
      ]),
    };

    const service = makeService({
      sessionRepo,
      campaignRepo,
      sceneService,
      sessionNpcStateService,
    });

    await service.create("user-1", {
      name: "Solo: Ilha",
      campaignId: "campaign-1",
    });

    expect(sceneService.create).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        locationId: "loc-1",
        title: "Ilha do Diabo",
        reason: "session_bootstrap",
      }),
    );
    expect(sessionNpcStateService.listByPoi).toHaveBeenCalledWith(
      "session-1",
      "poi-1",
    );
    expect(sceneService.addNpcToScene).toHaveBeenCalledWith(
      "scene-1",
      "npc-1",
      "present",
    );
    expect(sceneService.addNpcToScene).not.toHaveBeenCalledWith(
      "scene-1",
      "npc-dead",
      "present",
    );
  });

  it("resolves the home location default POI for canonical NPCs missing home_poi_id", async () => {
    const sessionRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: "session-1", ...value })),
    };
    const campaignRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "campaign-1",
        name: "Ilha do Diabo",
        startingLocationId: "loc-1",
        generationSeed: {},
      }),
      save: jest.fn(async (value) => value),
    };
    // NPC sem home_poi_id (mundo gerado antes da atribuição de POI), só com a
    // location — deve cair no POI default da location.
    const npcRepo = {
      find: jest.fn().mockResolvedValue([
        { id: "npc-1", homeLocationId: "loc-1", homePoiId: null },
        { id: "npc-2", homeLocationId: "loc-1", homePoiId: null },
        { id: "npc-3", homeLocationId: null, homePoiId: null },
      ]),
    };
    const createdStates: any[] = [];
    const npcStateRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value) => {
        createdStates.push(value);
        return value;
      }),
      save: jest.fn(async (value) => value),
    };
    const ensureDefaultForLocation = jest
      .fn()
      .mockResolvedValue({ id: "poi-default" });
    const sceneService = {
      create: jest.fn().mockResolvedValue({ id: "scene-1", poiId: "poi-default" }),
      getSceneNpcs: jest.fn().mockResolvedValue([]),
      addNpcToScene: jest.fn().mockResolvedValue({}),
    };
    const sessionNpcStateService = {
      listByPoi: jest.fn().mockResolvedValue([]),
    };

    const service = makeService({
      sessionRepo,
      campaignRepo,
      npcRepo,
      npcStateRepo,
      sceneService,
      sessionNpcStateService,
      poiService: { ensureDefaultForLocation },
    });

    await service.create("user-1", {
      name: "Solo: Ilha",
      campaignId: "campaign-1",
    });

    // Memoiza por location: 1 chamada para loc-1 (npc-1 e npc-2), nenhuma para
    // npc-3 (sem home_location).
    expect(ensureDefaultForLocation).toHaveBeenCalledTimes(1);
    expect(ensureDefaultForLocation).toHaveBeenCalledWith("campaign-1", "loc-1");
    expect(createdStates).toEqual([
      expect.objectContaining({ npcId: "npc-1", currentPoiId: "poi-default" }),
      expect.objectContaining({ npcId: "npc-2", currentPoiId: "poi-default" }),
      expect.objectContaining({ npcId: "npc-3", currentPoiId: undefined }),
    ]);
  });

  it("does not downgrade an NPC already added to the scene by cold open", async () => {
    const sessionRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: "session-1", ...value })),
    };
    const campaignRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: "campaign-1",
        name: "Ilha do Diabo",
        startingLocationId: "loc-1",
        generationSeed: {},
      }),
      save: jest.fn(async (value) => value),
    };
    const sceneService = {
      create: jest.fn().mockResolvedValue({
        id: "scene-1",
        locationId: "loc-1",
        poiId: "poi-1",
      }),
      getSceneNpcs: jest
        .fn()
        .mockResolvedValue([{ npcId: "npc-focal", presenceRole: "interlocutor" }]),
      addNpcToScene: jest.fn().mockResolvedValue({}),
    };
    const sessionNpcStateService = {
      listByPoi: jest.fn().mockResolvedValue([
        { npcId: "npc-focal", status: "alive" },
        { npcId: "npc-other", status: "alive" },
      ]),
    };

    const service = makeService({
      sessionRepo,
      campaignRepo,
      sceneService,
      sessionNpcStateService,
    });

    await service.create("user-1", {
      name: "Solo: Ilha",
      campaignId: "campaign-1",
    });

    expect(sceneService.addNpcToScene).not.toHaveBeenCalledWith(
      "scene-1",
      "npc-focal",
      "present",
    );
    expect(sceneService.addNpcToScene).toHaveBeenCalledWith(
      "scene-1",
      "npc-other",
      "present",
    );
  });
});
