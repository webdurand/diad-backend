import {
  buildMinimalWorldSeedBody,
  MinimalWorldSeedService,
} from "./minimal-world-seed.service";
import {
  LocationConnectionEntity,
  LocationEntity,
  NpcEntity,
} from "src/entities";

describe("buildMinimalWorldSeedBody", () => {
  it("builds a deterministic playable floor with locations, POIs, connections and NPCs", () => {
    const body = buildMinimalWorldSeedBody({
      seedKey: "camp-1",
      hubName: "Vila inicial",
      plazaName: "Praca central",
      tone: "misterioso",
    });

    expect(body.startingLocationName).toBe("Vila inicial");
    expect(body.context?.locations).toHaveLength(5);
    expect(body.connections).toHaveLength(4);
    expect(body.context?.npcs).toHaveLength(8);
    expect(
      body.context?.locations?.flatMap((location) => location.pois ?? []),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.any(String),
          description: expect.any(String),
        }),
      ]),
    );
    expect(body.context?.npcs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.any(String),
          role: expect.any(String),
          disposition: expect.any(String),
          location_name: expect.any(String),
        }),
      ]),
    );
  });
});

describe("MinimalWorldSeedService", () => {
  function makeService(options: {
    locations?: Array<Partial<LocationEntity>>;
    npcCount?: number;
    connectionCount?: number;
  }) {
    const locationRepo = {
      find: jest.fn().mockResolvedValue(options.locations ?? []),
    };
    const npcRepo = {
      count: jest.fn().mockResolvedValue(options.npcCount ?? 0),
    };
    const connectionRepo = {
      count: jest.fn().mockResolvedValue(options.connectionCount ?? 0),
    };
    const dataSource = {
      getRepository: jest.fn((entity: any) => {
        if (entity === LocationEntity) return locationRepo;
        if (entity === NpcEntity) return npcRepo;
        if (entity === LocationConnectionEntity) return connectionRepo;
        throw new Error(`Unexpected repository ${entity?.name}`);
      }),
    };
    const materializedCampaign = { id: "camp-1", startingLocationId: "loc-2" };
    const worldSeedMaterializationService = {
      materialize: jest.fn().mockResolvedValue(materializedCampaign),
    };
    const service = new MinimalWorldSeedService(
      dataSource as any,
      worldSeedMaterializationService as any,
    );
    return {
      service,
      locationRepo,
      npcRepo,
      connectionRepo,
      worldSeedMaterializationService,
      materializedCampaign,
    };
  }

  it("materializes the fallback seed for an empty AI campaign and reuses existing anchors", async () => {
    const { service, worldSeedMaterializationService, materializedCampaign } =
      makeService({
        locations: [
          { id: "loc-1", name: "Vila inicial", type: "city" },
          {
            id: "loc-2",
            name: "Praca central",
            type: "outdoor",
            parentId: "loc-1",
          },
        ],
      });

    const result = await service.ensureMinimalPlayableWorld({
      id: "camp-1",
      dmMode: "ai",
      isSandbox: false,
      startingLocationId: "loc-2",
      contentBudget: { maxScenes: 12, maxNpcs: 7, maxLocations: 6 },
    } as any);

    expect(result).toBe(materializedCampaign);
    expect(worldSeedMaterializationService.materialize).toHaveBeenCalledWith(
      "camp-1",
      expect.objectContaining({
        startingLocationName: "Vila inicial",
        connections: expect.arrayContaining([
          expect.objectContaining({ travel_hours: expect.any(Number) }),
        ]),
      }),
    );
    const body = worldSeedMaterializationService.materialize.mock.calls[0][1];
    expect(body.context.npcs.length).toBeGreaterThanOrEqual(6);
    expect(body.context.locations.length).toBeGreaterThanOrEqual(3);
  });

  it("leaves authored worlds untouched", async () => {
    const { service, worldSeedMaterializationService } = makeService({
      locations: [{ id: "loc-1", name: "Autorado", type: "city" }],
      npcCount: 2,
      connectionCount: 0,
    });

    const result = await service.ensureMinimalPlayableWorld({
      id: "camp-1",
      dmMode: "ai",
      isSandbox: false,
    } as any);

    expect(result).toBeNull();
    expect(worldSeedMaterializationService.materialize).not.toHaveBeenCalled();
  });
});
