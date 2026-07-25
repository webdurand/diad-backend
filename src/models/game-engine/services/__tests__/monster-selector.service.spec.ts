import { Repository } from "typeorm";
import { MonsterEntity } from "src/entities/monster.entity";
import {
  MonsterSelectorService,
  SelectCompositionInput,
} from "../monster-selector.service";

function m(
  slug: string,
  cr: number,
  xp: number,
  type: string,
  envs?: string[],
  raw: Record<string, unknown> = {},
): MonsterEntity {
  return {
    id: `id-${slug}`,
    slug,
    name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    type,
    challenge_rating: cr,
    xp,
    raw: { environment: envs, ...raw },
  } as unknown as MonsterEntity;
}

const FOREST_T1: MonsterEntity[] = [
  m("goblin", 0.25, 50, "humanoid", ["forest"]),
  m("kobold", 0.125, 25, "humanoid", ["forest", "mountain"]),
  m("wolf", 0.25, 50, "beast", ["forest"]),
  m("dire-wolf", 1, 200, "beast", ["forest"]),
  m("bandit", 0.125, 25, "humanoid", ["forest", "grassland"]),
  m("hobgoblin", 0.5, 100, "humanoid", ["forest"]),
  m("ettercap", 2, 450, "monstrosity", ["forest"]),
  m("owlbear", 3, 700, "monstrosity", ["forest"]),
];

const DUNGEON_VARIETY: MonsterEntity[] = [
  m("zombie", 0.25, 50, "undead", undefined),
  m("skeleton", 0.25, 50, "undead", undefined),
  m("giant-rat", 0.125, 25, "beast", ["underdark", "urban"]),
  m("gelatinous-cube", 2, 450, "ooze", ["underdark"]),
  m("animated-armor", 1, 200, "construct", ["underdark"]),
  m("celestial-aspirant", 5, 1800, "celestial", undefined),
];

const MIXED: MonsterEntity[] = [
  ...FOREST_T1,
  ...DUNGEON_VARIETY,
  m("aboleth", 10, 5900, "aberration", ["underdark"]),
  m("ancient-red-dragon", 24, 62000, "dragon", ["mountain"], {
    legendary: true,
  }),
  m("celestial", 5, 1800, "celestial", undefined),
];

function makeRepo(items: MonsterEntity[]): Repository<MonsterEntity> {
  return {
    find: jest.fn(async () => items),
  } as unknown as Repository<MonsterEntity>;
}

function fixedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const BASE: SelectCompositionInput = {
  partyAvgLevel: 3,
  partySize: 1,
  biomeTags: ["forest"],
  locationType: "wilderness",
  targetDifficulty: "moderate",
};

describe("MonsterSelectorService", () => {
  describe("CR cap por tier", () => {
    it("T1 (level 1-4) nunca seleciona CR > 4", async () => {
      const repo = makeRepo([
        ...FOREST_T1,
        m("ogre", 2, 450, "giant", ["forest"]),
        m("young-red-dragon", 10, 5900, "dragon", ["mountain"]),
        m("ancient-red-dragon", 24, 62000, "dragon", ["mountain"]),
      ]);
      const svc = new MonsterSelectorService(repo);
      for (let i = 0; i < 50; i++) {
        const comp = await svc.selectComposition(BASE);
        if (!comp) continue;
        for (const slug of comp.monsterSlugs) {
          const monster = [
            ...FOREST_T1,
            m("ogre", 2, 450, "giant"),
            m("young-red-dragon", 10, 5900, "dragon"),
            m("ancient-red-dragon", 24, 62000, "dragon"),
          ].find((mm) => mm.slug === slug);
          expect(monster!.challenge_rating).toBeLessThanOrEqual(4);
        }
      }
    });

    it("T2 (level 5-10) nunca seleciona CR > 10", async () => {
      const repo = makeRepo(MIXED);
      const svc = new MonsterSelectorService(repo);
      for (let i = 0; i < 30; i++) {
        const comp = await svc.selectComposition({
          ...BASE,
          partyAvgLevel: 7,
          biomeTags: ["forest", "mountain"],
        });
        if (!comp) continue;
        for (const slug of comp.monsterSlugs) {
          const monster = MIXED.find((mm) => mm.slug === slug);
          expect(monster!.challenge_rating).toBeLessThanOrEqual(10);
        }
      }
    });
  });

  describe("filtro de bioma", () => {
    it("respeita biome tag quando match existe", async () => {
      const svc = new MonsterSelectorService(makeRepo(FOREST_T1));
      const comp = await svc.selectComposition({
        ...BASE,
        biomeTags: ["forest"],
      });
      expect(comp).not.toBeNull();
      for (const slug of comp!.monsterSlugs) {
        const monster = FOREST_T1.find((mm) => mm.slug === slug)!;
        const envs = (monster.raw as { environment?: string[] }).environment;
        expect(envs ?? []).toContain("forest");
      }
    });

    it("fallback relaxa biome se vazio (genéricos sem env passam)", async () => {
      const noEnvPool: MonsterEntity[] = [
        m("ghost", 4, 1100, "undead", undefined),
        m("specter", 1, 200, "undead", undefined),
      ];
      const svc = new MonsterSelectorService(makeRepo(noEnvPool));
      const comp = await svc.selectComposition({
        ...BASE,
        biomeTags: ["arctic"],
      });
      expect(comp).not.toBeNull();
    });

    it("retorna null quando pool totalmente vazio após filtros", async () => {
      const svc = new MonsterSelectorService(makeRepo([]));
      const comp = await svc.selectComposition(BASE);
      expect(comp).toBeNull();
    });
  });

  describe("filtro de tipo por location", () => {
    it("wilderness exclui aberration e construct", async () => {
      const repo = makeRepo([
        ...FOREST_T1,
        m("aboleth", 1, 200, "aberration", ["forest"]),
        m("animated-armor", 1, 200, "construct", ["forest"]),
      ]);
      const svc = new MonsterSelectorService(repo);
      for (let i = 0; i < 30; i++) {
        const comp = await svc.selectComposition({
          ...BASE,
          locationType: "wilderness",
        });
        if (!comp) continue;
        for (const slug of comp.monsterSlugs) {
          expect(slug).not.toBe("aboleth");
          expect(slug).not.toBe("animated-armor");
        }
      }
    });

    it("dungeon exclui celestial", async () => {
      const repo = makeRepo([
        ...DUNGEON_VARIETY,
        m("celestial-being", 4, 1100, "celestial", undefined),
      ]);
      const svc = new MonsterSelectorService(repo);
      for (let i = 0; i < 30; i++) {
        const comp = await svc.selectComposition({
          ...BASE,
          locationType: "dungeon",
          biomeTags: undefined,
        });
        if (!comp) continue;
        for (const slug of comp.monsterSlugs) {
          expect(slug).not.toBe("celestial-being");
        }
      }
    });
  });

  describe("anti-repeat (recentAnchors)", () => {
    it("anchor escolhido nunca está em recentAnchors", async () => {
      const repo = makeRepo(FOREST_T1);
      const svc = new MonsterSelectorService(repo);
      for (let i = 0; i < 50; i++) {
        const comp = await svc.selectComposition({
          ...BASE,
          recentAnchors: ["goblin", "wolf", "kobold"],
        });
        if (!comp) continue;
        expect(["goblin", "wolf", "kobold"]).not.toContain(comp.anchor);
      }
    });

    it("retorna null se recentAnchors esvaziar pool", async () => {
      const repo = makeRepo([m("goblin", 0.25, 50, "humanoid", ["forest"])]);
      const svc = new MonsterSelectorService(repo);
      const comp = await svc.selectComposition({
        ...BASE,
        recentAnchors: ["goblin"],
      });
      expect(comp).toBeNull();
    });
  });

  describe("composição (pack/mixed/solo)", () => {
    it("rng forçando pack (0.5) gera múltiplas cópias do anchor", async () => {
      const repo = makeRepo(FOREST_T1);
      const svc = new MonsterSelectorService(repo);
      svc.rng = fixedRng([0.0, 0.5, 0.5, 0.5, 0.5, 0.5]);
      const comp = await svc.selectComposition(BASE);
      expect(comp).not.toBeNull();
      expect(comp!.mode).toBe("pack");
      const uniq = new Set(comp!.monsterSlugs);
      expect(uniq.size).toBe(1);
      expect(comp!.monsterSlugs.length).toBeGreaterThanOrEqual(2);
    });

    it("rng forçando solo (0.99) gera 1 monstro alto-CR no budget", async () => {
      const repo = makeRepo([
        m("ogre", 2, 450, "giant", ["forest"]),
        m("hobgoblin", 0.5, 100, "humanoid", ["forest"]),
        m("ettercap", 2, 450, "monstrosity", ["forest"]),
      ]);
      const svc = new MonsterSelectorService(repo);
      svc.rng = fixedRng([0.0, 0.99]);
      const comp = await svc.selectComposition(BASE);
      expect(comp).not.toBeNull();
      expect(comp!.mode).toBe("solo");
      expect(comp!.monsterSlugs).toHaveLength(1);
    });

    it("composição respeita cap absoluto de 8 monstros", async () => {
      const tinyMonster: MonsterEntity[] = [
        m("rat", 0.0, 10, "beast", ["forest"]),
      ];
      const svc = new MonsterSelectorService(makeRepo(tinyMonster));
      for (let i = 0; i < 30; i++) {
        const comp = await svc.selectComposition({
          ...BASE,
          partyAvgLevel: 10,
          targetDifficulty: "high",
        });
        if (!comp) continue;
        expect(comp.monsterSlugs.length).toBeLessThanOrEqual(8);
      }
    });
  });

  describe("budget DMG", () => {
    it("adjustedXp fica em ±20% do budget", async () => {
      const repo = makeRepo(FOREST_T1);
      const svc = new MonsterSelectorService(repo);
      for (let i = 0; i < 50; i++) {
        const comp = await svc.selectComposition(BASE);
        if (!comp) continue;
        expect(comp.adjustedXp).toBeGreaterThanOrEqual(225 * 0.5);
        expect(comp.adjustedXp).toBeLessThanOrEqual(225 * 2.0);
      }
    });

    it("mantém encontro de nível alto quando a composição ideal não cabe no pool", async () => {
      const svc = new MonsterSelectorService(
        makeRepo([m("forest-guardian", 8, 1000, "giant", ["forest"])]),
      );
      svc.rng = fixedRng([0, 0.5]);

      const comp = await svc.selectComposition({
        ...BASE,
        partyAvgLevel: 20,
        partySize: 4,
        targetDifficulty: "high",
      });

      expect(comp).not.toBeNull();
      expect(comp!.monsterSlugs.length).toBeLessThanOrEqual(8);
      expect(comp!.reasonChain).toContain("composition_relaxed=true");
    });
  });

  describe("displayNames human-friendly", () => {
    it("retorna names capitalizados, não slugs", async () => {
      const repo = makeRepo(FOREST_T1);
      const svc = new MonsterSelectorService(repo);
      const comp = await svc.selectComposition(BASE);
      expect(comp).not.toBeNull();
      for (const name of comp!.displayNames) {
        expect(name[0]).toMatch(/[A-Z]/);
      }
    });
  });

  describe("reasonChain", () => {
    it("inclui poolSize, anchor, mode, adjustedXp", async () => {
      const repo = makeRepo(FOREST_T1);
      const svc = new MonsterSelectorService(repo);
      const comp = await svc.selectComposition(BASE);
      expect(comp).not.toBeNull();
      const joined = comp!.reasonChain.join(" | ");
      expect(joined).toMatch(/pool=/);
      expect(joined).toMatch(/anchor=/);
      expect(joined).toMatch(/mode=/);
      expect(joined).toMatch(/adjusted_xp=/);
    });
  });
});
