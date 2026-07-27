jest.mock("../../data/transformers", () => {
  const actual = jest.requireActual("../../data/transformers");
  return {
    ...actual,
    transformRaces: jest.fn(),
    transformSubraces: jest.fn(),
  };
});

import {
  CompSourceEntity,
  RaceEntity,
  RaceTraitEntity,
  SubraceEntity,
  SubraceTraitEntity,
  TraitEntity,
} from "../../entities";
import * as transformers from "../../data/transformers";
import { AdminService } from "./admin.service";

function entries(...items: Array<[name: string, description: string]>) {
  return items.map(([name, description]) => ({
    type: "entries",
    name,
    entries: [description],
  }));
}

function createHarness() {
  const traitRows = new Map<string, { id: string; slug: string }>();
  let raceLinks = new Set<string>(["race-human-phb|legacy-subrace-trait"]);
  let subraceLinks = new Set<string>();
  let failNextSubraceLink = false;
  const deleteCounts = {
    raceTraits: 0,
    subraceTraits: 0,
  };
  const sources = [
    { id: "source-phb", code: "PHB" },
    { id: "source-erlw", code: "ERLW" },
  ];
  const races = [
    {
      id: "race-human-phb",
      slug: "human-phb",
    },
    {
      id: "race-dragonborn-phb",
      slug: "dragonborn-phb",
    },
  ];
  const subraces = [
    {
      id: "subrace-human-mark-of-making-erlw",
      slug: "human-mark-of-making-erlw",
    },
  ];

  (
    transformers.transformRaces as jest.MockedFunction<
      typeof transformers.transformRaces
    >
  ).mockReturnValue([
    {
      slug: "human-phb",
      name: "Human",
      source_code: "PHB",
      raw: {
        source: "PHB",
        entries: entries(
          ["Age", "Humans reach adulthood in their late teens."],
          ["Languages", "You know Common and one extra language."],
        ),
      },
    },
    {
      slug: "dragonborn-phb",
      name: "Dragonborn",
      source_code: "PHB",
      raw: {
        source: "PHB",
        entries: entries(
          ["Age", "Young dragonborn grow quickly."],
          ["Languages", "You know Common and Draconic."],
        ),
      },
    },
  ] as any);
  (
    transformers.transformSubraces as jest.MockedFunction<
      typeof transformers.transformSubraces
    >
  ).mockReturnValue([
    {
      slug: "human-mark-of-making-erlw",
      race_slug: "human-phb",
      name: "Mark of Making",
      source_code: "ERLW",
      raw: {
        source: "ERLW",
        entries: entries([
          "Artisan's Intuition",
          "Roll a d4 on relevant checks.",
        ]),
      },
    },
  ] as any);

  const traitInsertBuilder: any = {};
  let pendingTrait: Record<string, unknown> | null = null;
  Object.assign(traitInsertBuilder, {
    insert: jest.fn(() => traitInsertBuilder),
    into: jest.fn(() => traitInsertBuilder),
    values: jest.fn((value: Record<string, unknown>) => {
      pendingTrait = value;
      return traitInsertBuilder;
    }),
    orUpdate: jest.fn(() => traitInsertBuilder),
    execute: jest.fn(async () => {
      const slug = String(pendingTrait?.slug);
      traitRows.set(slug, {
        id: `trait:${slug}`,
        slug,
      });
      return {};
    }),
  });

  const repositoryFor = (entity: unknown): any => {
    if (entity === CompSourceEntity) {
      return { find: jest.fn(async () => sources) };
    }
    if (entity === RaceEntity) {
      return { find: jest.fn(async () => races) };
    }
    if (entity === SubraceEntity) {
      return { find: jest.fn(async () => subraces) };
    }
    if (entity === TraitEntity) {
      return {
        find: jest.fn(async () => [...traitRows.values()]),
      };
    }
    throw new Error(`Unexpected repository ${String(entity)}`);
  };

  const manager = {
    createQueryBuilder: jest.fn(() => {
      let deleteTarget: unknown;
      const builder: any = {};
      Object.assign(builder, {
        delete: jest.fn(() => builder),
        from: jest.fn((entity: unknown) => {
          deleteTarget = entity;
          return builder;
        }),
        execute: jest.fn(async () => {
          if (deleteTarget === RaceTraitEntity) {
            deleteCounts.raceTraits += 1;
            raceLinks.clear();
          } else if (deleteTarget === SubraceTraitEntity) {
            deleteCounts.subraceTraits += 1;
            subraceLinks.clear();
          }
          return {};
        }),
      });
      return builder;
    }),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === RaceTraitEntity) {
        return {
          upsert: jest.fn(
            async (link: { race_id: string; trait_id: string }) => {
              raceLinks.add(`${link.race_id}|${link.trait_id}`);
            },
          ),
        };
      }
      if (entity === SubraceTraitEntity) {
        return {
          upsert: jest.fn(
            async (link: { subrace_id: string; trait_id: string }) => {
              if (failNextSubraceLink) {
                failNextSubraceLink = false;
                throw new Error("subrace link failed");
              }
              subraceLinks.add(`${link.subrace_id}|${link.trait_id}`);
            },
          ),
        };
      }
      throw new Error(`Unexpected transactional repository ${String(entity)}`);
    }),
  };
  const dataSource = {
    getRepository: jest.fn(repositoryFor),
    createQueryBuilder: jest.fn(() => traitInsertBuilder),
    transaction: jest.fn(async (callback: (value: any) => unknown) => {
      const raceSnapshot = new Set(raceLinks);
      const subraceSnapshot = new Set(subraceLinks);
      try {
        return await callback(manager);
      } catch (error) {
        raceLinks = raceSnapshot;
        subraceLinks = subraceSnapshot;
        throw error;
      }
    }),
  };

  return {
    service: new AdminService(dataSource as any),
    traitRows,
    get raceLinks() {
      return raceLinks;
    },
    get subraceLinks() {
      return subraceLinks;
    },
    deleteCounts,
    failNextSubraceLink() {
      failNextSubraceLink = true;
    },
  };
}

describe("AdminService.seedTraits ownership reconciliation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("replaces legacy links, keeps subrace traits out of the base race, and is idempotent", async () => {
    const harness = createHarness();

    const first = await harness.service.seedTraits();
    const firstRaceLinks = [...harness.raceLinks].sort();
    const firstSubraceLinks = [...harness.subraceLinks].sort();
    const second = await harness.service.seedTraits();

    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
    expect(first.success).toBe(5);
    expect(second.success).toBe(5);
    expect([...harness.raceLinks].sort()).toEqual(firstRaceLinks);
    expect([...harness.subraceLinks].sort()).toEqual(firstSubraceLinks);
    expect(firstRaceLinks).toEqual([
      "race-dragonborn-phb|trait:race-dragonborn-phb-age-phb",
      "race-dragonborn-phb|trait:race-dragonborn-phb-languages-phb",
      "race-human-phb|trait:race-human-phb-age-phb",
      "race-human-phb|trait:race-human-phb-languages-phb",
    ]);
    expect(firstSubraceLinks).toEqual([
      "subrace-human-mark-of-making-erlw|trait:artisans-intuition-erlw",
    ]);
    expect(
      firstRaceLinks.some((link) => link.includes("artisans-intuition")),
    ).toBe(false);
    expect(harness.deleteCounts).toEqual({
      raceTraits: 2,
      subraceTraits: 2,
    });
  });

  it("rolls back both junction tables when rebuilding a link fails", async () => {
    const harness = createHarness();
    const originalRaceLinks = [...harness.raceLinks];
    harness.failNextSubraceLink();

    const result = await harness.service.seedTraits();

    expect(result.errors).toEqual([
      {
        slug: "trait-links",
        message: "subrace link failed",
      },
    ]);
    expect([...harness.raceLinks]).toEqual(originalRaceLinks);
    expect([...harness.subraceLinks]).toEqual([]);
  });
});
