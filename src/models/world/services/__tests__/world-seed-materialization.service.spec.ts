import { LocationEntity, LocationPoiEntity, NpcArchetypeTemplateEntity, NpcEntity } from "src/entities";
import { WorldSeedMaterializationService } from "../world-seed-materialization.service";

describe("WorldSeedMaterializationService", () => {
  const createService = () =>
    new WorldSeedMaterializationService({} as any) as any as {
      persistNpcs: (
        manager: any,
        campaignId: string,
        seeds: any[],
        locations: Map<string, LocationEntity>,
        startingLocationName?: string | null,
        poisByLocation?: Map<string, LocationPoiEntity[]>,
        maxNpcs?: number,
      ) => Promise<Map<string, NpcEntity>>;
      allocateNpcsByPoiKind: (
        seeds: any[],
        locations: Map<string, LocationEntity>,
        fallbackLocation: LocationEntity | undefined,
        poisByLocation: Map<string, LocationPoiEntity[]>,
        maxNpcs?: number,
      ) => any[];
    };

  const createNpcRepo = () => {
    const saved: NpcEntity[] = [];
    return {
      saved,
      repo: {
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn((input: Partial<NpcEntity>) => ({ ...input }) as NpcEntity),
        save: jest.fn(async (npc: NpcEntity) => {
          const persisted = { ...npc, id: npc.id ?? `${npc.slug}-id` } as NpcEntity;
          saved.push(persisted);
          return persisted;
        }),
      },
    };
  };

  const createManager = (npcRepo: ReturnType<typeof createNpcRepo>["repo"]) => ({
    getRepository: jest.fn((entity) => {
      if (entity === NpcEntity) return npcRepo;
      if (entity === NpcArchetypeTemplateEntity) {
        return { findOne: jest.fn().mockResolvedValue(null) };
      }
      throw new Error(`Unexpected repository: ${entity?.name}`);
    }),
  });

  it("distribui NPCs com apenas homeLocation pelos POIs conhecidos do local", async () => {
    const service = createService();
    const { repo, saved } = createNpcRepo();
    const manager = createManager(repo);
    const location = { id: "location-1", name: "Doca Branca" } as LocationEntity;
    const pois = [
      { id: "poi-market", locationId: location.id, name: "Mercado", sortOrder: 1, isKnownToParty: true, isLocked: false },
      { id: "poi-tavern", locationId: location.id, name: "Taverna", sortOrder: 2, isKnownToParty: true, isLocked: false },
    ] as LocationPoiEntity[];

    await service.persistNpcs(
      manager,
      "campaign-1",
      [
        { name: "Ari", location_name: "Doca Branca" },
        { name: "Boro", location_name: "Doca Branca" },
        { name: "Cira", location_name: "Doca Branca" },
        { name: "Dain", location_name: "Doca Branca" },
      ],
      new Map([["doca branca", location]]),
      null,
      new Map([[location.id, pois]]),
    );

    expect(saved.map((npc) => npc.homePoiId)).toEqual([
      "poi-market",
      "poi-tavern",
      "poi-market",
      "poi-tavern",
    ]);
  });

  it("mantem homePoiId explicito do seed acima do fallback distribuido", async () => {
    const service = createService();
    const { repo, saved } = createNpcRepo();
    const manager = createManager(repo);
    const location = { id: "location-1", name: "Doca Branca" } as LocationEntity;
    const pois = [
      { id: "poi-market", locationId: location.id, name: "Mercado", sortOrder: 1, isKnownToParty: true, isLocked: false },
    ] as LocationPoiEntity[];

    await service.persistNpcs(
      manager,
      "campaign-1",
      [{ name: "Ari", location_name: "Doca Branca", homePoiId: "poi-explicit" }],
      new Map([["doca branca", location]]),
      null,
      new Map([[location.id, pois]]),
    );

    expect(saved[0].homePoiId).toBe("poi-explicit");
  });

  it("aloca NPCs por quota de POI sem residentes em wild", () => {
    const service = createService();
    const location = { id: "location-1", name: "Doca Branca" } as LocationEntity;
    const pois = [
      {
        id: "poi-tavern",
        locationId: location.id,
        name: "Taverna",
        kind: "social",
        type: "tavern",
        sortOrder: 1,
        isKnownToParty: true,
        isLocked: false,
      },
      {
        id: "poi-shrine",
        locationId: location.id,
        name: "Santuário",
        kind: "objective",
        phaseIndex: 1,
        sortOrder: 2,
        isKnownToParty: true,
        isLocked: false,
      },
      {
        id: "poi-woods",
        locationId: location.id,
        name: "Bosque",
        kind: "wild",
        sortOrder: 3,
        isKnownToParty: true,
        isLocked: false,
      },
    ] as LocationPoiEntity[];

    const allocated = service.allocateNpcsByPoiKind(
      [
        { name: "Ari", location_name: "Doca Branca" },
        { name: "Boro", location_name: "Doca Branca" },
      ],
      new Map([["doca branca", location]]),
      location,
      new Map([[location.id, pois]]),
      4,
    );

    expect(allocated.some((npc) => npc.homePoiId === "poi-tavern")).toBe(true);
    expect(allocated.some((npc) => npc.homePoiId === "poi-shrine")).toBe(true);
    expect(allocated.every((npc) => npc.homePoiId !== "poi-woods")).toBe(true);
    expect(allocated).toHaveLength(4);
  });

  it("preenche routineSlots para NPC core com pelo menos dois POIs", async () => {
    const service = createService();
    const { repo, saved } = createNpcRepo();
    const manager = createManager(repo);
    const location = { id: "location-1", name: "Doca Branca" } as LocationEntity;
    const pois = [
      {
        id: "poi-tavern",
        locationId: location.id,
        name: "Taverna",
        kind: "social",
        sortOrder: 1,
        isKnownToParty: true,
        isLocked: false,
      },
      {
        id: "poi-market",
        locationId: location.id,
        name: "Mercado",
        kind: "social",
        sortOrder: 2,
        isKnownToParty: true,
        isLocked: false,
      },
      {
        id: "poi-temple",
        locationId: location.id,
        name: "Templo",
        kind: "social",
        sortOrder: 3,
        isKnownToParty: true,
        isLocked: false,
      },
    ] as LocationPoiEntity[];

    await service.persistNpcs(
      manager,
      "campaign-1",
      [{ name: "Ari", location_name: "Doca Branca", profile_depth: "core" }],
      new Map([["doca branca", location]]),
      null,
      new Map([[location.id, pois]]),
      6,
    );

    const ari = saved.find((npc) => npc.name === "Ari");
    expect(ari?.routineSlots).toEqual(
      expect.objectContaining({
        morning: expect.any(String),
        afternoon: expect.any(String),
        evening: expect.any(String),
        night: expect.any(String),
      }),
    );
  });

  it("usa o POI default da location como safety-net quando todos os POIs sao wild", async () => {
    const service = createService();
    const { repo, saved } = createNpcRepo();
    const manager = createManager(repo);
    const location = { id: "location-1", name: "Doca Branca" } as LocationEntity;
    // Reproduz o estado do banco real: todo POI nasceu "wild" (default da coluna).
    const pois = [
      {
        id: "poi-doca",
        locationId: location.id,
        name: "Doca",
        kind: "wild",
        sortOrder: 2,
        isDefault: false,
        isKnownToParty: true,
        isLocked: false,
      },
      {
        id: "poi-default",
        locationId: location.id,
        name: "Praca",
        kind: "wild",
        sortOrder: 1,
        isDefault: true,
        isKnownToParty: true,
        isLocked: false,
      },
    ] as LocationPoiEntity[];

    await service.persistNpcs(
      manager,
      "campaign-1",
      [{ name: "Ari", location_name: "Doca Branca" }],
      new Map([["doca branca", location]]),
      null,
      new Map([[location.id, pois]]),
    );

    // pickFallbackPoiId exclui wild -> undefined; safety-net cai no POI default.
    expect(saved[0].homePoiId).toBe("poi-default");
  });

  it("ensureLocationPois deriva kind safe em local civilizado e wild em local selvagem", async () => {
    const service = createService() as any;
    const savedPois: LocationPoiEntity[] = [];
    const poiRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn((input: Partial<LocationPoiEntity>) => ({ ...input })),
      save: jest.fn(async (poi: LocationPoiEntity) => {
        const persisted = { ...poi, id: poi.id ?? `${poi.slug}-id` } as LocationPoiEntity;
        savedPois.push(persisted);
        return persisted;
      }),
    };
    const manager = { getRepository: jest.fn(() => poiRepo) };

    await service.ensureLocationPois(
      manager,
      "campaign-1",
      { id: "loc-city", name: "Vila", type: "city" } as LocationEntity,
      [
        { name: "Taverna", isKnownToParty: true },
        { name: "Cofre Secreto", isSecret: true },
      ],
    );
    expect(savedPois.find((p) => p.name === "Taverna")?.kind).toBe("safe");
    expect(savedPois.find((p) => p.name === "Cofre Secreto")?.kind).toBe("wild");

    savedPois.length = 0;
    await service.ensureLocationPois(
      manager,
      "campaign-1",
      { id: "loc-wild", name: "Bosque", type: "wilderness" } as LocationEntity,
      [{ name: "Clareira", isKnownToParty: true }],
    );
    expect(savedPois.find((p) => p.name === "Clareira")?.kind).toBe("wild");
  });

  it("ignora homePoiId wild explicito para residentes", async () => {
    const service = createService();
    const { repo, saved } = createNpcRepo();
    const manager = createManager(repo);
    const location = { id: "location-1", name: "Doca Branca" } as LocationEntity;
    const pois = [
      {
        id: "poi-safe",
        locationId: location.id,
        name: "Praça",
        kind: "safe",
        sortOrder: 1,
        isKnownToParty: true,
        isLocked: false,
      },
      {
        id: "poi-woods",
        locationId: location.id,
        name: "Bosque",
        kind: "wild",
        sortOrder: 2,
        isKnownToParty: true,
        isLocked: false,
      },
    ] as LocationPoiEntity[];

    await service.persistNpcs(
      manager,
      "campaign-1",
      [
        {
          name: "Ari",
          location_name: "Doca Branca",
          homePoiId: "poi-woods",
        },
      ],
      new Map([["doca branca", location]]),
      null,
      new Map([[location.id, pois]]),
      2,
    );

    expect(saved[0].homePoiId).toBe("poi-safe");
  });
});
