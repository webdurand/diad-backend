import { Repository } from "typeorm";
import { MagicItemEntity } from "src/entities/magic-item.entity";
import {
  MagicItemSelectorService,
  PartyTier,
} from "../magic-item-selector.service";

function makeItem(slug: string, rarity: string): MagicItemEntity {
  return {
    id: `id-${slug}`,
    slug,
    name: slug.replace(/-/g, " "),
    rarity: { name: rarity },
  } as unknown as MagicItemEntity;
}

const POOL: MagicItemEntity[] = [
  makeItem("potion-of-healing", "Common"),
  makeItem("alchemy-jug", "Common"),
  makeItem("bag-of-holding", "Uncommon"),
  makeItem("cloak-of-protection", "Uncommon"),
  makeItem("flame-tongue", "Rare"),
  makeItem("ring-of-spell-storing", "Rare"),
  makeItem("vorpal-sword", "Very Rare"),
  makeItem("staff-of-power", "Very Rare"),
  makeItem("holy-avenger", "Legendary"),
  makeItem("artifact-of-doom", "Artifact"),
];

function makeRepo(items: MagicItemEntity[] = POOL): Repository<MagicItemEntity> {
  return {
    find: jest.fn(async (opts: { where?: { rarity?: { name?: string } } }) => {
      const target = opts?.where?.rarity?.name;
      if (!target) return items;
      return items.filter((it) => (it.rarity as { name: string }).name === target);
    }),
  } as unknown as Repository<MagicItemEntity>;
}

function fixedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("MagicItemSelectorService", () => {
  describe("tier rarity caps (replica TIER_LOOT_RARITY)", () => {
    it("T1 só sorteia Common ou Uncommon", async () => {
      const svc = new MagicItemSelectorService(makeRepo());
      const seen = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const item = await svc.pickByTier("1");
        if (item) seen.add((item.rarity as { name: string }).name);
      }
      expect([...seen].every((r) => r === "Common" || r === "Uncommon")).toBe(true);
      expect(seen.size).toBeGreaterThan(0);
    });

    it("T2 sorteia Common, Uncommon ou Rare", async () => {
      const svc = new MagicItemSelectorService(makeRepo());
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const item = await svc.pickByTier("2");
        if (item) seen.add((item.rarity as { name: string }).name);
      }
      expect(seen.has("Legendary")).toBe(false);
      expect(seen.has("Very Rare")).toBe(false);
    });

    it("T3 sorteia Uncommon, Rare ou Very Rare (sem Legendary)", async () => {
      const svc = new MagicItemSelectorService(makeRepo());
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const item = await svc.pickByTier("3");
        if (item) seen.add((item.rarity as { name: string }).name);
      }
      expect(seen.has("Legendary")).toBe(false);
      expect(seen.has("Common")).toBe(false);
    });

    it("T4 sorteia Rare, Very Rare ou Legendary (sem Common/Uncommon)", async () => {
      const svc = new MagicItemSelectorService(makeRepo());
      const seen = new Set<string>();
      for (let i = 0; i < 300; i++) {
        const item = await svc.pickByTier("4");
        if (item) seen.add((item.rarity as { name: string }).name);
      }
      expect(seen.has("Common")).toBe(false);
      expect(seen.has("Uncommon")).toBe(false);
    });
  });

  describe("nunca sorteia Artifact (V2 escopo)", () => {
    it("nenhum tier deve sortear Artifact", async () => {
      const svc = new MagicItemSelectorService(makeRepo());
      const tiers: PartyTier[] = ["1", "2", "3", "4"];
      for (const t of tiers) {
        for (let i = 0; i < 50; i++) {
          const item = await svc.pickByTier(t);
          if (item) {
            expect((item.rarity as { name: string }).name).not.toBe("Artifact");
          }
        }
      }
    });
  });

  describe("rng injetado — determinismo", () => {
    it("rng=0 escolhe primeira rarity da tabela renormalizada (Common em T1)", async () => {
      const svc = new MagicItemSelectorService(makeRepo());
      svc.rng = fixedRng([0, 0]);
      const item = await svc.pickByTier("1");
      expect(item).not.toBeNull();
      expect((item!.rarity as { name: string }).name).toBe("Common");
    });

    it("rng=0.99 escolhe última rarity elegível em T1 (Uncommon)", async () => {
      const svc = new MagicItemSelectorService(makeRepo());
      svc.rng = fixedRng([0.99, 0.5]);
      const item = await svc.pickByTier("1");
      expect(item).not.toBeNull();
      expect((item!.rarity as { name: string }).name).toBe("Uncommon");
    });
  });

  describe("pool vazio", () => {
    it("retorna null se rarity escolhida não tem items", async () => {
      const repo = makeRepo([]);
      const svc = new MagicItemSelectorService(repo);
      const item = await svc.pickByTier("1");
      expect(item).toBeNull();
    });

    it("fallback retorna null se zero items no banco", async () => {
      const svc = new MagicItemSelectorService(makeRepo([]));
      for (const t of ["1", "2", "3", "4"] as PartyTier[]) {
        expect(await svc.pickByTier(t)).toBeNull();
      }
    });
  });

  describe("distribuição estatística (T2)", () => {
    it("T2 dá ~58% Common, ~41% Uncommon, ~14% Rare em 1000 rolls", async () => {
      const svc = new MagicItemSelectorService(makeRepo());
      const counts: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        const item = await svc.pickByTier("2");
        if (!item) continue;
        const r = (item.rarity as { name: string }).name;
        counts[r] = (counts[r] ?? 0) + 1;
      }
      expect(counts["Common"]).toBeGreaterThan(420);
      expect(counts["Common"]).toBeLessThan(620);
      expect(counts["Uncommon"]).toBeGreaterThan(280);
      expect(counts["Uncommon"]).toBeLessThan(450);
      expect(counts["Rare"]).toBeGreaterThan(70);
      expect(counts["Rare"]).toBeLessThan(220);
    });
  });
});
