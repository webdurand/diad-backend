import {
  TILE_EFFECT_CATALOG,
  getTileEffectDefinition,
  type TileEffectKind,
} from "./tile-effect-catalog";

describe("tile-effect-catalog", () => {
  const slugs: TileEffectKind[] = [
    "grease",
    "web",
    "spike-growth",
    "wall-of-fire",
    "cloud-of-daggers",
    "sleet-storm",
    "spirit-guardians",
  ];

  describe("catalog invariants (Princípio X)", () => {
    it.each(slugs)('entry "%s" exists with required fields', (slug) => {
      const def = TILE_EFFECT_CATALOG[slug];
      expect(def).toBeDefined();
      expect(def.spellSlug).toBe(slug);
      expect(def.shapeKind).toMatch(/^(sphere|cube|cylinder|line|cone)$/);
      expect(typeof def.defaultRadiusCells(1)).toBe("number");
      expect(typeof def.isDifficultTerrain).toBe("boolean");
      expect(typeof def.sourceConcentration).toBe("boolean");
      expect(def.triggers.length).toBeGreaterThanOrEqual(1);
    });

    it.each(slugs)(
      'entry "%s" has narrative descriptor ≤120 chars PT-BR',
      (slug) => {
        const def = TILE_EFFECT_CATALOG[slug];
        expect(def.narrativeDescriptor).toBeDefined();
        expect(def.narrativeDescriptor.length).toBeGreaterThan(0);
        expect(def.narrativeDescriptor.length).toBeLessThanOrEqual(120);
      },
    );

    it.each(slugs)(
      'entry "%s" has tactical metadata in valid range',
      (slug) => {
        const def = TILE_EFFECT_CATALOG[slug];
        expect(def.tactical).toBeDefined();
        expect(def.tactical.tags.length).toBeGreaterThanOrEqual(1);
        expect(def.tactical.tacticalValue).toBeGreaterThanOrEqual(0);
        expect(def.tactical.tacticalValue).toBeLessThanOrEqual(10);
        expect(["caster", "allies", "neutral"]).toContain(
          def.tactical.beneficiaryFaction,
        );
      },
    );
  });

  describe("Grease (PHB 2024 p.273)", () => {
    const def = TILE_EFFECT_CATALOG.grease;

    it("is a 10ft cube (2 cells radius)", () => {
      expect(def.shapeKind).toBe("cube");
      expect(def.defaultRadiusCells(1)).toBe(2);
    });

    it("is difficult terrain (×2 cost)", () => {
      expect(def.isDifficultTerrain).toBe(true);
      expect(def.speedMultiplier).toBe(0.5);
    });

    it("is concentration 1min (10 rounds)", () => {
      expect(def.sourceConcentration).toBe(true);
      expect(def.durationRoundsAtSlot(1)).toBe(10);
    });

    it("has on-cast and on-enter DEX save → prone", () => {
      const onCast = def.triggers.find((t) => t.kind === "on-cast");
      const onEnter = def.triggers.find((t) => t.kind === "on-enter");
      expect(onCast).toBeDefined();
      expect(onEnter).toBeDefined();
      expect(onCast?.save?.ability).toBe("dex");
      expect(onCast?.save?.onFailCondition).toBe("prone");
      expect(onEnter?.save?.ability).toBe("dex");
      expect(onEnter?.save?.onFailCondition).toBe("prone");
    });
  });

  describe("Web (PHB 2024)", () => {
    const def = TILE_EFFECT_CATALOG.web;

    it("is 20ft cube (4 cells radius)", () => {
      expect(def.shapeKind).toBe("cube");
      expect(def.defaultRadiusCells(2)).toBe(4);
    });

    it("stops movement when save fails (speedMultiplier=0)", () => {
      expect(def.speedMultiplier).toBe(0);
    });

    it("applies restrained on save fail", () => {
      const onEnter = def.triggers.find((t) => t.kind === "on-enter");
      expect(onEnter?.save?.onFailCondition).toBe("restrained");
    });
  });

  describe("Spike Growth (PHB 2024 p.329)", () => {
    const def = TILE_EFFECT_CATALOG["spike-growth"];

    it("is 20ft sphere/radius", () => {
      expect(def.shapeKind).toBe("sphere");
      expect(def.defaultRadiusCells(2)).toBe(4);
    });

    it("damages per 5ft moved (no save) — 2d4 piercing", () => {
      const moveTrig = def.triggers.find((t) => t.kind === "on-move-through");
      expect(moveTrig).toBeDefined();
      const dmg = moveTrig?.damagePerCell?.expressionPerSlot(2);
      expect(dmg).toBe("2d4");
      expect(moveTrig?.damagePerCell?.type).toBe("piercing");
    });

    it("is NOT concentration broken by damage — RAW: full duration 10min (100 rounds)", () => {
      expect(def.sourceConcentration).toBe(true);
      expect(def.durationRoundsAtSlot(2)).toBeGreaterThanOrEqual(100);
    });
  });

  describe("Wall of Fire (PHB 2024 p.353)", () => {
    const def = TILE_EFFECT_CATALOG["wall-of-fire"];

    it("is a 60ft line (12 cells radius)", () => {
      expect(def.shapeKind).toBe("line");
      expect(def.defaultRadiusCells(4)).toBe(12);
    });

    it("has on-cast DEX save (half) 5d8 fire", () => {
      const onCast = def.triggers.find((t) => t.kind === "on-cast");
      expect(onCast?.save?.ability).toBe("dex");
      expect(onCast?.save?.halfOnSave).toBe(true);
      expect(onCast?.damage?.expressionPerSlot(4)).toBe("5d8");
      expect(onCast?.damage?.type).toBe("fire");
    });

    it("has on-pass-through-wall 5d8 fire (no save)", () => {
      const passThrough = def.triggers.find(
        (t) => t.kind === "on-pass-through-wall",
      );
      expect(passThrough).toBeDefined();
      expect(passThrough?.damage?.expressionPerSlot(4)).toBe("5d8");
    });

    it("has on-end-turn-adjacent 5d8 fire range:1", () => {
      const endTurn = def.triggers.find(
        (t) => t.kind === "on-end-turn-adjacent",
      );
      expect(endTurn).toBeDefined();
      expect(endTurn?.range).toBe(1);
      expect(endTurn?.damage?.expressionPerSlot(4)).toBe("5d8");
    });

    it("scales +1d8 per slot above 4", () => {
      const onCast = def.triggers.find((t) => t.kind === "on-cast");
      expect(onCast?.damage?.expressionPerSlot(5)).toBe("6d8");
      expect(onCast?.damage?.expressionPerSlot(7)).toBe("8d8");
    });
  });

  describe("Cloud of Daggers (PHB 2024 — damage on cast NEW)", () => {
    const def = TILE_EFFECT_CATALOG["cloud-of-daggers"];

    it("is 5ft cube (1 cell radius)", () => {
      expect(def.shapeKind).toBe("cube");
      expect(def.defaultRadiusCells(2)).toBe(1);
    });

    it("damages 4d4 slashing on cast (2024 change)", () => {
      const onCast = def.triggers.find((t) => t.kind === "on-cast");
      expect(onCast?.damage?.expressionPerSlot(2)).toBe("4d4");
      expect(onCast?.damage?.type).toBe("slashing");
    });

    it("damages on-enter and on-start-turn-in (no save)", () => {
      const onEnter = def.triggers.find((t) => t.kind === "on-enter");
      const onStart = def.triggers.find((t) => t.kind === "on-start-turn-in");
      expect(onEnter?.damage?.expressionPerSlot(2)).toBe("4d4");
      expect(onStart?.damage?.expressionPerSlot(2)).toBe("4d4");
      expect(onEnter?.save).toBeUndefined();
    });

    it("scales +2d4 per slot above 2", () => {
      const onCast = def.triggers.find((t) => t.kind === "on-cast");
      expect(onCast?.damage?.expressionPerSlot(3)).toBe("6d4");
      expect(onCast?.damage?.expressionPerSlot(5)).toBe("10d4");
    });
  });

  describe("Sleet Storm (PHB 2024 — dimensions inverted, save fused)", () => {
    const def = TILE_EFFECT_CATALOG["sleet-storm"];

    it("is 20ft radius cylinder (4 cells)", () => {
      expect(def.shapeKind).toBe("cylinder");
      expect(def.defaultRadiusCells(3)).toBe(4);
    });

    it("is difficult terrain", () => {
      expect(def.isDifficultTerrain).toBe(true);
    });

    it("on-enter fires DEX save → prone+concentration-check (fused 2024)", () => {
      const onEnter = def.triggers.find((t) => t.kind === "on-enter");
      expect(onEnter?.save?.ability).toBe("dex");
      expect(onEnter?.save?.onFailCondition).toBe("prone");
      expect(onEnter?.save?.affectsConcentration).toBe(true);
    });

    it("also fires on-start-turn-in (same fused save)", () => {
      const startTurn = def.triggers.find((t) => t.kind === "on-start-turn-in");
      expect(startTurn?.save?.ability).toBe("dex");
      expect(startTurn?.save?.affectsConcentration).toBe(true);
    });
  });

  describe("Spirit Guardians (legacy refactor — auraFollowsCaster)", () => {
    const def = TILE_EFFECT_CATALOG["spirit-guardians"];

    it("is 15ft sphere (3 cells)", () => {
      expect(def.shapeKind).toBe("sphere");
      expect(def.defaultRadiusCells(3)).toBe(3);
    });

    it("aura follows the caster on movement", () => {
      expect(def.auraFollowsCaster).toBe(true);
    });

    it("on-start-turn-in WIS save half, 3d8 radiant", () => {
      const startTurn = def.triggers.find((t) => t.kind === "on-start-turn-in");
      expect(startTurn?.save?.ability).toBe("wis");
      expect(startTurn?.save?.halfOnSave).toBe(true);
      expect(startTurn?.damage?.expressionPerSlot(3)).toBe("3d8");
      expect(startTurn?.damage?.type).toBe("radiant");
    });

    it("scales +1d8 per slot above 3", () => {
      const startTurn = def.triggers.find((t) => t.kind === "on-start-turn-in");
      expect(startTurn?.damage?.expressionPerSlot(4)).toBe("4d8");
      expect(startTurn?.damage?.expressionPerSlot(9)).toBe("9d8");
    });
  });

  describe("getTileEffectDefinition helper", () => {
    it("returns the entry for a known slug", () => {
      expect(getTileEffectDefinition("grease")?.spellSlug).toBe("grease");
    });

    it("returns null for unknown slug", () => {
      expect(getTileEffectDefinition("not-a-spell")).toBeNull();
    });
  });
});
