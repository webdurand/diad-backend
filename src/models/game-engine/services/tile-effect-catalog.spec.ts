import {
  TILE_EFFECT_CATALOG,
  getTileEffectDefinition,
  type TileEffectKind,
} from "./tile-effect-catalog";

describe("tile-effect-catalog", () => {
  const slugs: TileEffectKind[] = [
    "grease",
    "web",
    "fog-cloud",
    "zone-of-truth",
    "spike-growth",
    "wall-of-fire",
    "cloud-of-daggers",
    "sleet-storm",
    "spirit-guardians",
    "spiritual-weapon",
    "conjure-animals",
    "conjure-elemental",
    "guardian-of-faith",
    "conjure-woodland-beings",
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
      expect(Array.isArray(def.triggers)).toBe(true);
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

    it("is a 10ft square (2 cells per side)", () => {
      expect(def.shapeKind).toBe("cube");
      expect(def.defaultRadiusCells(1)).toBe(2);
    });

    it("is difficult terrain (×2 cost)", () => {
      expect(def.isDifficultTerrain).toBe(true);
      expect(def.speedMultiplier).toBe(0.5);
    });

    it("lasts 1min (10 rounds) without concentration", () => {
      expect(def.sourceConcentration).toBe(false);
      expect(def.durationRoundsAtSlot(1)).toBe(10);
    });

    it("saves on cast, entry, and end of turn → prone", () => {
      const onCast = def.triggers.find((t) => t.kind === "on-cast");
      const onEnter = def.triggers.find((t) => t.kind === "on-enter");
      const onEndTurn = def.triggers.find(
        (t) => t.kind === "on-end-turn-in",
      );
      expect(onCast).toBeDefined();
      expect(onEnter).toBeDefined();
      expect(onEndTurn).toBeDefined();
      expect(onCast?.save?.ability).toBe("dex");
      expect(onCast?.save?.onFailCondition).toBe("prone");
      expect(onEnter?.save?.ability).toBe("dex");
      expect(onEnter?.save?.onFailCondition).toBe("prone");
      expect(onEndTurn?.save?.ability).toBe("dex");
      expect(onEndTurn?.save?.onFailCondition).toBe("prone");
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

  describe("Fog Cloud (PHB 2024)", () => {
    const def = TILE_EFFECT_CATALOG["fog-cloud"];

    it("is a 20ft radius sphere at level 1 and scales by 20ft per slot", () => {
      expect(def.shapeKind).toBe("sphere");
      expect(def.defaultRadiusCells(1)).toBe(4);
      expect(def.defaultRadiusCells(2)).toBe(8);
    });

    it("is concentration up to 1 hour and visual/control only", () => {
      expect(def.sourceConcentration).toBe(true);
      expect(def.durationRoundsAtSlot(1)).toBe(600);
      expect(def.isDifficultTerrain).toBe(false);
      expect(def.triggers).toEqual([]);
      expect(def.tactical.tags).toEqual(
        expect.arrayContaining(["obscurement", "vision-block"]),
      );
    });
  });

  describe("Zone of Truth (PHB 2024)", () => {
    const def = TILE_EFFECT_CATALOG["zone-of-truth"];

    it("is a 15ft sphere lasting 10 minutes without concentration", () => {
      expect(def.shapeKind).toBe("sphere");
      expect(def.defaultRadiusCells(2)).toBe(3);
      expect(def.durationRoundsAtSlot(2)).toBe(100);
      expect(def.sourceConcentration).toBe(false);
      expect(def.isDifficultTerrain).toBe(false);
    });

    it("uses CHA saves on first entry and at the start of a turn", () => {
      const onEnter = def.triggers.find((trigger) => trigger.kind === "on-enter");
      const onStart = def.triggers.find(
        (trigger) => trigger.kind === "on-start-turn-in",
      );
      expect(onEnter?.save?.ability).toBe("cha");
      expect(onEnter?.save?.onFailCondition).toBe("truth_bound");
      expect(onEnter?.oncePerTurn).toBe(true);
      expect(onStart?.save?.ability).toBe("cha");
      expect(onStart?.save?.onFailCondition).toBe("truth_bound");
      expect(def.triggers.some((trigger) => trigger.kind === "on-cast")).toBe(
        false,
      );
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

    it("has on-pass-through-wall 5d8 fire once per turn (no save)", () => {
      const passThrough = def.triggers.find(
        (t) => t.kind === "on-pass-through-wall",
      );
      expect(passThrough).toBeDefined();
      expect(passThrough?.damage?.expressionPerSlot(4)).toBe("5d8");
      expect(passThrough?.oncePerTurn).toBe(true);
    });

    it("has on-end-turn-adjacent 5d8 fire at the full 10-foot range", () => {
      const endTurn = def.triggers.find(
        (t) => t.kind === "on-end-turn-adjacent",
      );
      expect(endTurn).toBeDefined();
      expect(endTurn?.range).toBe(2);
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

    it("damages on-enter and on-end-turn-in once per turn (no save)", () => {
      const onEnter = def.triggers.find((t) => t.kind === "on-enter");
      const onEnd = def.triggers.find((t) => t.kind === "on-end-turn-in");
      expect(onEnter?.damage?.expressionPerSlot(2)).toBe("4d4");
      expect(onEnd?.damage?.expressionPerSlot(2)).toBe("4d4");
      expect(onEnter?.oncePerTurn).toBe(true);
      expect(onEnd?.oncePerTurn).toBe(true);
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

  describe("Spiritual Weapon (SRD 2014)", () => {
    const def = TILE_EFFECT_CATALOG["spiritual-weapon"];

    it("is a ten-round point effect without concentration", () => {
      expect(def.shapeKind).toBe("sphere");
      expect(def.defaultRadiusCells(2)).toBe(0);
      expect(def.durationRoundsAtSlot(2)).toBe(10);
      expect(def.sourceConcentration).toBe(false);
      expect(def.isDifficultTerrain).toBe(false);
    });

    it("is not a creature and has no automatic area triggers", () => {
      expect(def.triggers).toEqual([]);
      expect(def.tactical.tags).toEqual(
        expect.arrayContaining(["movable", "bonus-action", "force"]),
      );
    });
  });

  describe("Conjure Woodland Beings (PHB 2024)", () => {
    const def = TILE_EFFECT_CATALOG["conjure-woodland-beings"];

    it("is a 10ft emanation that follows the caster", () => {
      expect(def.shapeKind).toBe("sphere");
      expect(def.defaultRadiusCells(4)).toBe(2);
      expect(def.auraFollowsCaster).toBe(true);
      expect(def.isDifficultTerrain).toBe(false);
    });

    it("damages on cast, entry, and end of turn at most once per turn", () => {
      for (const kind of ["on-cast", "on-enter", "on-end-turn-in"] as const) {
        const trigger = def.triggers.find((candidate) => candidate.kind === kind);
        expect(trigger?.save?.ability).toBe("wis");
        expect(trigger?.save?.halfOnSave).toBe(true);
        expect(trigger?.damage?.expressionPerSlot(4)).toBe("5d8");
        expect(trigger?.damage?.type).toBe("force");
        expect(trigger?.oncePerTurn).toBe(true);
      }
    });

    it("scales +1d8 per slot above 4", () => {
      const onCast = def.triggers.find((trigger) => trigger.kind === "on-cast");
      expect(onCast?.damage?.expressionPerSlot(5)).toBe("6d8");
      expect(onCast?.damage?.expressionPerSlot(9)).toBe("10d8");
    });
  });

  describe("Storm of Vengeance", () => {
    const def = TILE_EFFECT_CATALOG["storm-of-vengeance"];

    it("persists a 360ft concentration cylinder for ten rounds", () => {
      expect(def.shapeKind).toBe("cylinder");
      expect(def.defaultRadiusCells(9)).toBe(72);
      expect(def.durationRoundsAtSlot(9)).toBe(10);
      expect(def.sourceConcentration).toBe(true);
      expect(def.isDifficultTerrain).toBe(true);
      expect(def.speedMultiplier).toBe(0.5);
      expect(def.triggers).toEqual([]);
      expect(def.tactical.tags).toEqual(
        expect.arrayContaining([
          "heavily-obscured",
          "difficult-terrain",
          "ranged-attacks-impossible",
          "multi-round",
        ]),
      );
    });
  });

  describe("Conjure Animals (PHB 2024)", () => {
    const def = TILE_EFFECT_CATALOG["conjure-animals"];

    it("uses a Large pack plus a 10ft surrounding envelope", () => {
      expect(def.shapeKind).toBe("cube");
      expect(def.defaultRadiusCells(3)).toBe(6);
      expect(def.isDifficultTerrain).toBe(false);
      expect(def.sourceConcentration).toBe(true);
      expect(def.durationRoundsAtSlot(3)).toBe(100);
    });

    it("damages on relocation, entry, and end of turn at most once per turn", () => {
      for (const kind of [
        "on-area-moved-into",
        "on-enter",
        "on-end-turn-in",
      ] as const) {
        const trigger = def.triggers.find((candidate) => candidate.kind === kind);
        expect(trigger?.save?.ability).toBe("dex");
        expect(trigger?.save?.halfOnSave).toBe(true);
        expect(trigger?.damage?.expressionPerSlot(3)).toBe("3d10");
        expect(trigger?.damage?.type).toBe("slashing");
        expect(trigger?.oncePerTurn).toBe(true);
      }
    });

    it("scales +1d10 per slot above 3", () => {
      const onMove = def.triggers.find(
        (trigger) => trigger.kind === "on-area-moved-into",
      );
      expect(onMove?.damage?.expressionPerSlot(4)).toBe("4d10");
      expect(onMove?.damage?.expressionPerSlot(5)).toBe("5d10");
      expect(onMove?.damage?.expressionPerSlot(9)).toBe("9d10");
    });
  });

  describe("Conjure Elemental (PHB 2024)", () => {
    const def = TILE_EFFECT_CATALOG["conjure-elemental"];

    it("uses a stationary Large core plus the 5ft start-turn perimeter", () => {
      expect(def.shapeKind).toBe("cube");
      expect(def.defaultRadiusCells(5)).toBe(4);
      expect(def.auraFollowsCaster).not.toBe(true);
      expect(def.isDifficultTerrain).toBe(false);
      expect(def.durationRoundsAtSlot(5)).toBe(100);
    });

    it("uses 8d8 initially and 4d8 on a restrained target's repeated save", () => {
      const onEnter = def.triggers.find(
        (trigger) => trigger.kind === "on-enter",
      );
      const onStart = def.triggers.find(
        (trigger) => trigger.kind === "on-start-turn-in",
      );
      const repeat = def.triggers.find(
        (trigger) => trigger.kind === "on-restrained-start-turn",
      );
      for (const trigger of [onEnter, onStart]) {
        expect(trigger?.save?.ability).toBe("dex");
        expect(trigger?.save?.onFailCondition).toBe("restrained");
        expect(trigger?.damage?.expressionPerSlot(5)).toBe("8d8");
      }
      expect(repeat?.save?.ability).toBe("dex");
      expect(repeat?.damage?.expressionPerSlot(5)).toBe("4d8");
    });

    it("scales both damage rolls +1d8 per slot above 5", () => {
      const initial = def.triggers.find(
        (trigger) => trigger.kind === "on-enter",
      );
      const repeat = def.triggers.find(
        (trigger) => trigger.kind === "on-restrained-start-turn",
      );
      expect(initial?.damage?.expressionPerSlot(7)).toBe("10d8");
      expect(repeat?.damage?.expressionPerSlot(7)).toBe("6d8");
      expect(initial?.damage?.expressionPerSlot(9)).toBe("12d8");
      expect(repeat?.damage?.expressionPerSlot(9)).toBe("8d8");
    });
  });

  describe("Guardian of Faith (SRD 5.2)", () => {
    const def = TILE_EFFECT_CATALOG["guardian-of-faith"];

    it("uses a stationary Large core and a 10ft hostile envelope", () => {
      expect(def.shapeKind).toBe("cube");
      expect(def.defaultRadiusCells(4)).toBe(6);
      expect(def.auraFollowsCaster).not.toBe(true);
      expect(def.isDifficultTerrain).toBe(false);
      expect(def.sourceConcentration).toBe(false);
      expect(def.durationRoundsAtSlot(4)).toBe(4800);
      expect(def.tactical).toEqual(
        expect.objectContaining({
          targeting: "hostile_only",
          damageBudgetTotal: 60,
          damageDealtTotal: 0,
        }),
      );
    });

    it("deals 20 radiant with a DEX save for half on entry or turn start", () => {
      for (const kind of ["on-enter", "on-start-turn-in"] as const) {
        const trigger = def.triggers.find(
          (candidate) => candidate.kind === kind,
        );
        expect(trigger?.save?.ability).toBe("dex");
        expect(trigger?.save?.halfOnSave).toBe(true);
        expect(trigger?.damage?.expressionPerSlot(4)).toBe("20");
        expect(trigger?.damage?.type).toBe("radiant");
        expect(trigger?.oncePerTurn).toBe(true);
      }
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
