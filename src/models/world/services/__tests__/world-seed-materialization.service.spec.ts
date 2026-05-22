import { LocationEntity, LocationPoiEntity, NpcArchetypeTemplateEntity, NpcEntity } from "src/entities";
import { WorldSeedMaterializationService } from "../world-seed-materialization.service";

describe("WorldSeedMaterializationService", () => {
  const createService = () =>
    new WorldSeedMaterializationService({} as any) as WorldSeedMaterializationService & {
      persistNpcs: (
        manager: any,
        campaignId: string,
        seeds: any[],
        locations: Map<string, LocationEntity>,
        startingLocationName?: string | null,
        poisByLocation?: Map<string, LocationPoiEntity[]>,
      ) => Promise<Map<string, NpcEntity>>;
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
});
