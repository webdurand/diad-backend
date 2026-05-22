import { MoveToPoiService } from "../move-to-poi.service";

const makeLogger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

function makeService(overrides: Record<string, any> = {}): MoveToPoiService {
  return new MoveToPoiService(
    overrides.sessionRepo as any,
    overrides.sceneNpcRepo as any,
    overrides.poiService as any,
    overrides.sceneService as any,
    (overrides.eventBus ?? { publish: jest.fn() }) as any,
    (overrides.envelopeFactory ?? { build: jest.fn((value) => value) }) as any,
    (overrides.contextCache ?? { invalidate: jest.fn() }) as any,
    (overrides.movementLockService ?? {
      getActiveForSession: jest.fn().mockResolvedValue(null),
      getForScene: jest.fn().mockReturnValue(null),
    }) as any,
    (overrides.logger ?? makeLogger()) as any,
    (overrides.metaQueryService ?? {
      remainingForScene: jest.fn().mockResolvedValue(3),
    }) as any,
    (overrides.dialogueActionGenerator ?? {
      generate: jest.fn().mockReturnValue([]),
    }) as any,
    (overrides.openModeActionGenerator ?? {
      generate: jest.fn().mockReturnValue([]),
    }) as any,
    (overrides.characterSheetService ?? { computeSheet: jest.fn() }) as any,
    overrides.sessionNpcStateService as any,
  );
}

describe("MoveToPoiService POI NPC population", () => {
  it("carries companions and adds ambient NPCs that live in the target POI", async () => {
    const service = makeService({
      sessionRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: "session-1",
          campaignId: "campaign-1",
          travelState: null,
        }),
      },
      sceneNpcRepo: {
        find: jest.fn().mockResolvedValue([
          { npcId: "companion-1", npc: { name: "Ari" } },
        ]),
      },
      poiService: {
        resolveInLocation: jest.fn().mockResolvedValue({
          status: "found",
          poi: {
            id: "poi-2",
            name: "Taverna",
            type: "social",
            description: "Mesas marcadas por velas.",
            atmosphere: "Quente",
            aliases: [],
            tags: [],
            isDefault: false,
            isLocked: false,
          },
        }),
      },
      sceneService: {
        getActive: jest.fn().mockResolvedValue({
          id: "scene-1",
          locationId: "loc-1",
          poiId: "poi-1",
          poi: { id: "poi-1", name: "Rua" },
        }),
        create: jest.fn().mockResolvedValue({
          id: "scene-2",
          locationId: "loc-1",
          poiId: "poi-2",
        }),
        getSceneNpcs: jest
          .fn()
          .mockResolvedValue([{ npcId: "companion-1", presenceRole: "companion" }]),
        addNpcToScene: jest.fn().mockResolvedValue({}),
      },
      sessionNpcStateService: {
        listByPoi: jest.fn().mockResolvedValue([
          { npcId: "ambient-1", status: "alive" },
          { npcId: "companion-1", status: "alive" },
          { npcId: "dead-1", status: "dead" },
        ]),
      },
    });

    const result = await service.run({
      sessionId: "session-1",
      targetPoiId: "poi-2",
    });

    expect(result.status).toBe("moved");
    expect((service as any).sessionNpcStateService.listByPoi).toHaveBeenCalledWith(
      "session-1",
      "poi-2",
    );
    expect((service as any).sceneService.addNpcToScene).toHaveBeenCalledWith(
      "scene-2",
      "companion-1",
      "companion",
    );
    expect((service as any).sceneService.addNpcToScene).toHaveBeenCalledWith(
      "scene-2",
      "ambient-1",
      "present",
    );
    expect((service as any).sceneService.addNpcToScene).not.toHaveBeenCalledWith(
      "scene-2",
      "dead-1",
      "present",
    );
  });
});

describe("MoveToPoiService POI hub envelope", () => {
  it("expoe hubPoiEnabled true apenas quando a flag existe na sessao", async () => {
    const makeEnvelopeService = (config: Record<string, unknown>) =>
      makeService({
        sessionRepo: {
          findOne: jest.fn().mockResolvedValue({
            id: "session-1",
            campaignId: "campaign-1",
            config,
            characterIds: [],
          }),
        },
        sceneNpcRepo: {
          find: jest.fn().mockResolvedValue([]),
        },
        poiService: {
          listKnownByLocation: jest.fn().mockResolvedValue([]),
        },
        sceneService: {
          getActive: jest.fn().mockResolvedValue({
            id: "scene-1",
            locationId: "loc-1",
            sceneMode: "open",
            socialCollective: false,
            contextSnapshot: {},
            location: { id: "loc-1", name: "Porto", type: "urban" },
            poi: null,
          }),
        },
        sessionNpcStateService: {
          listByPoi: jest.fn().mockResolvedValue([]),
        },
      });

    await expect(
      makeEnvelopeService({}).listAvailablePois("session-1", "user-1"),
    ).resolves.toEqual(expect.objectContaining({ hubPoiEnabled: false }));
    await expect(
      makeEnvelopeService({ hubPoiEnabled: true }).listAvailablePois(
        "session-1",
        "user-1",
      ),
    ).resolves.toEqual(expect.objectContaining({ hubPoiEnabled: true }));
  });
});
