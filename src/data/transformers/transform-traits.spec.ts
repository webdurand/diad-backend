import {
  disambiguateTraitStorageSlugs,
  extractTraitsFromRace,
  extractTraitsFromSubrace,
} from "./transform-traits";

describe("trait ownership", () => {
  it("gives same-named race traits distinct storage slugs and a stable canonical slug", () => {
    const human = extractTraitsFromRace({
      raceSlug: "human-phb",
      sourceCode: "PHB",
      entries: [
        {
          type: "entries",
          name: "Age",
          entries: ["Humans live less than a century."],
        },
      ],
      raw: {},
    });
    const dragonborn = extractTraitsFromRace({
      raceSlug: "dragonborn-phb",
      sourceCode: "PHB",
      entries: [
        {
          type: "entries",
          name: "Age",
          entries: ["Young dragonborn grow quickly."],
        },
      ],
      raw: {},
    });

    const [scopedHuman, scopedDragonborn] = disambiguateTraitStorageSlugs([
      human[0],
      dragonborn[0],
    ]);

    expect(scopedHuman).toMatchObject({
      slug: "race-human-phb-age-phb",
      canonical_slug: "age-phb",
      raw: {
        canonicalSlug: "age-phb",
        traitOwner: {
          kind: "race",
          raceSlug: "human-phb",
        },
      },
    });
    expect(scopedDragonborn.slug).toBe("race-dragonborn-phb-age-phb");
    expect(scopedDragonborn.slug).not.toBe(scopedHuman.slug);
  });

  it("keeps a subrace trait owned only by its exact subrace", () => {
    const [trait] = extractTraitsFromSubrace({
      subraceSlug: "human-mark-of-making-erlw",
      raceSlug: "human-phb",
      sourceCode: "ERLW",
      entries: [
        {
          type: "entries",
          name: "Artisan's Intuition",
          entries: ["Roll a d4."],
        },
      ],
      raw: {},
    });

    expect(trait).toMatchObject({
      slug: "artisans-intuition-erlw",
      canonical_slug: "artisans-intuition-erlw",
      race_slug: "human-phb",
      raw: {
        canonicalSlug: "artisans-intuition-erlw",
        traitOwner: {
          kind: "subrace",
          raceSlug: "human-phb",
          subraceSlug: "human-mark-of-making-erlw",
        },
      },
    });
  });

  it("keeps the public slug when multiple owners share the same definition", () => {
    const makeSharedTrait = (subraceSlug: string) =>
      extractTraitsFromSubrace({
        subraceSlug,
        raceSlug: "human-phb",
        sourceCode: "ERLW",
        entries: [
          {
            type: "entries",
            name: "Spells of the Mark",
            entries: ["Shared spell list."],
          },
        ],
        raw: {},
      })[0];

    const resolved = disambiguateTraitStorageSlugs([
      makeSharedTrait("human-mark-of-making-erlw"),
      makeSharedTrait("human-mark-of-passage-erlw"),
    ]);

    expect(resolved.map((trait) => trait.slug)).toEqual([
      "spells-of-the-mark-erlw",
      "spells-of-the-mark-erlw",
    ]);
  });
});
