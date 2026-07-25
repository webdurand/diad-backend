import {
  getAoeShape,
  cellInAoe,
  cellInSelfOriginAoe,
  getPerHitDamage,
  isAoeSpell,
  isMultiTargetNonAoeSpell,
  maxTargetsFor,
  repeatsFirstTargetToMaximum,
} from "./spell-targeting";

describe("spell-targeting", () => {
describe("getAoeShape", () => {
  it("prioritizes Thunderwave's canonical cube over stale imported metadata", () => {
    expect(
      getAoeShape({
        slug: "thunderwave",
        area_of_effect: { type: "sphere", size: 15 },
      } as any),
    ).toEqual({ kind: "cube", radiusCells: 3, sizeFt: 15 });
  });
    it("returns sphere shape with radius in cells for Fireball", () => {
      const shape = getAoeShape({
        area_of_effect: { type: "sphere", size: 20 },
      } as any);
      expect(shape).toEqual({ kind: "sphere", radiusCells: 4, sizeFt: 20 });
    });

    it("returns cone shape for Burning Hands 15ft", () => {
      const shape = getAoeShape({
        area_of_effect: { type: "cone", size: 15 },
      } as any);
      expect(shape).toEqual({ kind: "cone", radiusCells: 3, sizeFt: 15 });
    });

    it("returns cube shape for Thunderwave 15ft", () => {
      const shape = getAoeShape({
        area_of_effect: { type: "cube", size: 15 },
      } as any);
      expect(shape).toEqual({ kind: "cube", radiusCells: 3, sizeFt: 15 });
    });

    it.each([
      ["grease", "cube", 2, 10],
      ["cloud-of-daggers", "cube", 1, 5],
      ["sleet-storm", "cylinder", 4, 20],
      ["sleep", "sphere", 1, 5],
      ["call-lightning", "sphere", 1, 5],
      ["fire-storm", "cube", 2, 10],
      ["sunburst", "cylinder", 12, 60],
      ["storm-of-vengeance", "cylinder", 72, 360],
    ])(
      "maps canonical persistent area %s",
      (slug, kind, radiusCells, sizeFt) => {
        expect(getAoeShape({ slug, area_of_effect: null } as any)).toEqual({
          kind,
          radiusCells,
          sizeFt,
        });
      },
    );

    it("rejects XPHB 2024 metadata-only area_of_effect (tags apenas)", () => {
      const shape = getAoeShape({
        area_of_effect: { tags: ["multiple targets"] },
      } as any);
      expect(shape).toBeNull();
    });

    it("returns null when area_of_effect is null", () => {
      expect(getAoeShape({ area_of_effect: null } as any)).toBeNull();
    });

    it("uses the 2024 canonical 5ft sphere for Acid Splash", () => {
      expect(
        getAoeShape({ slug: "acid-splash", area_of_effect: null } as any),
      ).toEqual({ kind: "sphere", radiusCells: 1, sizeFt: 5 });
      expect(
        getAoeShape({ slug: "acid-splash-phb", area_of_effect: null } as any),
      ).toBeNull();
    });
  });

  describe("cellInAoe", () => {
    it("includes cells within sphere radius", () => {
      const shape = { kind: "sphere" as const, radiusCells: 4, sizeFt: 20 };
      expect(cellInAoe({ x: 2, y: 2 }, { x: 0, y: 0 }, shape)).toBe(true);
      expect(cellInAoe({ x: 4, y: 0 }, { x: 0, y: 0 }, shape)).toBe(true);
    });

    it("excludes cells outside sphere radius", () => {
      const shape = { kind: "sphere" as const, radiusCells: 4, sizeFt: 20 };
      expect(cellInAoe({ x: 5, y: 0 }, { x: 0, y: 0 }, shape)).toBe(false);

      expect(cellInAoe({ x: 3, y: 3 }, { x: 0, y: 0 }, shape)).toBe(false);

      expect(cellInAoe({ x: 2, y: 2 }, { x: 0, y: 0 }, shape)).toBe(true);
    });

    it("treats cube size as full side length in cells", () => {
      const shape = { kind: "cube" as const, radiusCells: 3, sizeFt: 15 };
      expect(cellInAoe({ x: 1, y: 1 }, { x: 0, y: 0 }, shape)).toBe(true);
      expect(cellInAoe({ x: 2, y: 0 }, { x: 0, y: 0 }, shape)).toBe(false);
    });
  });

  describe("getPerHitDamage", () => {
    it("returns 1d4+1 force for Magic Missile at any slot", () => {
      expect(getPerHitDamage("magic-missile", 1, 1)).toEqual({
        expression: "1d4+1",
        type: "force",
      });
      expect(getPerHitDamage("magic-missile", 5, 10)).toEqual({
        expression: "1d4+1",
        type: "force",
      });
    });

    it("returns 2d6 fire for Scorching Ray", () => {
      expect(getPerHitDamage("scorching-ray", 2, 5)).toEqual({
        expression: "2d6",
        type: "fire",
      });
    });

    it("returns 1d10 force for Eldritch Blast per beam", () => {
      expect(getPerHitDamage("eldritch-blast", 0, 5)).toEqual({
        expression: "1d10",
        type: "force",
      });
    });

    it("scales Acid Splash cantrip by caster level", () => {
      expect(getPerHitDamage("acid-splash", 0, 1)).toEqual({
        expression: "1d6",
        type: "acid",
      });
      expect(getPerHitDamage("acid-splash", 0, 5)).toEqual({
        expression: "2d6",
        type: "acid",
      });
      expect(getPerHitDamage("acid-splash", 0, 11)).toEqual({
        expression: "3d6",
        type: "acid",
      });
      expect(getPerHitDamage("acid-splash", 0, 17)).toEqual({
        expression: "4d6",
        type: "acid",
      });
    });

    it("handles xphb/phb suffixes", () => {
      expect(getPerHitDamage("magic-missile-xphb", 1, 1)).toEqual({
        expression: "1d4+1",
        type: "force",
      });
    });

    it("returns null for non-multi-target spells", () => {
      expect(getPerHitDamage("fireball", 3, 5)).toBeNull();
      expect(getPerHitDamage("cure-wounds", 1, 1)).toBeNull();
    });
  });

  describe("isAoeSpell + maxTargetsFor", () => {
    it("Fireball is AoE with infinity maxTargets", () => {
      const spell = {
        slug: "fireball",
        area_of_effect: { type: "sphere", size: 20 },
      } as any;
      expect(isAoeSpell(spell)).toBe(true);
      expect(maxTargetsFor(spell, 3, 5)).toBe(Number.POSITIVE_INFINITY);
    });

    it("Magic Missile is multi-target non-AoE, darts scale with slot", () => {
      const spell = { slug: "magic-missile", area_of_effect: null } as any;
      expect(isAoeSpell(spell)).toBe(false);
      expect(isMultiTargetNonAoeSpell(spell)).toBe(true);
      expect(maxTargetsFor(spell, 1, 1)).toBe(3);
      expect(maxTargetsFor(spell, 3, 5)).toBe(5);
    });

    it("Aid accepts up to three distinct non-AoE targets", () => {
      const spell = { slug: "aid-xphb", area_of_effect: null } as any;
      expect(isAoeSpell(spell)).toBe(false);
      expect(isMultiTargetNonAoeSpell(spell)).toBe(true);
      expect(maxTargetsFor(spell, 2, 5)).toBe(3);
      expect(repeatsFirstTargetToMaximum(spell)).toBe(false);
    });

    it("Chain Lightning allows one primary plus three jumps and scales by slot", () => {
      const spell = { slug: "chain-lightning", area_of_effect: null } as any;
      expect(isMultiTargetNonAoeSpell(spell)).toBe(true);
      expect(maxTargetsFor(spell, 6, 20)).toBe(4);
      expect(maxTargetsFor(spell, 8, 20)).toBe(6);
      expect(repeatsFirstTargetToMaximum(spell)).toBe(false);
    });

    it("trata Fog Cloud como esfera de 20 pés mesmo sem metadado de área no banco", () => {
      const spell = { slug: "fog-cloud", area_of_effect: null } as any;
      expect(getAoeShape(spell)).toEqual({
        kind: "sphere",
        radiusCells: 4,
        sizeFt: 20,
      });
      expect(isAoeSpell(spell)).toBe(true);
      expect(maxTargetsFor(spell, 1, 20)).toBe(Number.POSITIVE_INFINITY);
    });

    it("distinguishes Acid Splash 2024 area from the 2014 two-target version", () => {
      const current = { slug: "acid-splash", area_of_effect: null } as any;
      const legacy = { slug: "acid-splash-phb", area_of_effect: null } as any;
      expect(isAoeSpell(current)).toBe(true);
      expect(isMultiTargetNonAoeSpell(current)).toBe(false);
      expect(maxTargetsFor(current, 0, 5)).toBe(Number.POSITIVE_INFINITY);
      expect(isAoeSpell(legacy)).toBe(false);
      expect(isMultiTargetNonAoeSpell(legacy)).toBe(true);
      expect(maxTargetsFor(legacy, 0, 5)).toBe(2);
    });
  });

  describe("cellInSelfOriginAoe", () => {
    it("includes all eight adjacent cells in a 5ft emanation", () => {
      const shape = { kind: "sphere" as const, radiusCells: 1, sizeFt: 5 };
      for (const x of [-1, 0, 1]) {
        for (const y of [-1, 0, 1]) {
          if (x === 0 && y === 0) continue;
          expect(
            cellInSelfOriginAoe({ x, y }, { x: 0, y: 0 }, shape),
          ).toBe(true);
        }
      }
      expect(
        cellInSelfOriginAoe({ x: 2, y: 0 }, { x: 0, y: 0 }, shape),
      ).toBe(false);
    });
  });

  describe("repeatsFirstTargetToMaximum", () => {
    it("repete somente projéteis que podem convergir no mesmo alvo", () => {
      expect(repeatsFirstTargetToMaximum({ slug: "magic-missile" } as any)).toBe(
        true,
      );
      expect(
        repeatsFirstTargetToMaximum({ slug: "eldritch-blast-xphb" } as any),
      ).toBe(true);
      expect(
        repeatsFirstTargetToMaximum({ slug: "scorching-ray" } as any),
      ).toBe(true);
    });

    it("não duplica buffs nem alvos opcionais", () => {
      expect(repeatsFirstTargetToMaximum({ slug: "bless" } as any)).toBe(false);
      expect(repeatsFirstTargetToMaximum({ slug: "aid-xphb" } as any)).toBe(
        false,
      );
      expect(
        repeatsFirstTargetToMaximum({ slug: "acid-splash-phb" } as any),
      ).toBe(false);
    });
  });
});
