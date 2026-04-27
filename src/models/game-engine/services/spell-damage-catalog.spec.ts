import { getSpellDamage } from "./spell-damage-catalog";

describe("spell-damage-catalog", () => {
  describe("Magic Missile", () => {
    it("rolls 3d4+3 at slot 1 (3 darts × 1d4+1)", () => {
      const r = getSpellDamage("magic-missile", 1, 5);
      expect(r).toEqual({ expression: "3d4+3", type: "force" });
    });

    it("rolls 5d4+5 at slot 3 (5 darts)", () => {
      const r = getSpellDamage("magic-missile", 3, 11);
      expect(r).toEqual({ expression: "5d4+5", type: "force" });
    });

    it("rolls 11d4+11 at slot 9 (11 darts)", () => {
      const r = getSpellDamage("magic-missile", 9, 20);
      expect(r).toEqual({ expression: "11d4+11", type: "force" });
    });
  });

  describe("Fireball", () => {
    it("rolls 8d6 at slot 3", () => {
      expect(getSpellDamage("fireball", 3, 5)).toEqual({
        expression: "8d6",
        type: "fire",
      });
    });

    it("rolls 10d6 at slot 5 (+1d6 per slot above 3)", () => {
      expect(getSpellDamage("fireball", 5, 9)).toEqual({
        expression: "10d6",
        type: "fire",
      });
    });

    it("returns null when casting below min slot", () => {
      expect(getSpellDamage("fireball", 2, 5)).toBeNull();
    });
  });

  describe("Scorching Ray", () => {
    it("rolls 6d6 at slot 2 (3 rays × 2d6)", () => {
      expect(getSpellDamage("scorching-ray", 2, 5)).toEqual({
        expression: "6d6",
        type: "fire",
      });
    });

    it("rolls 10d6 at slot 4 (5 rays × 2d6)", () => {
      expect(getSpellDamage("scorching-ray", 4, 7)).toEqual({
        expression: "10d6",
        type: "fire",
      });
    });
  });

  describe("Cone of Cold / Chain Lightning / Disintegrate", () => {
    it("cone-of-cold 8d8 at slot 5", () => {
      expect(getSpellDamage("cone-of-cold", 5, 9)).toEqual({
        expression: "8d8",
        type: "cold",
      });
    });

    it("chain-lightning 10d8 at slot 6 (no scaling)", () => {
      expect(getSpellDamage("chain-lightning", 6, 11)).toEqual({
        expression: "10d8",
        type: "lightning",
      });
    });

    it("disintegrate 10d6+40 at slot 6", () => {
      expect(getSpellDamage("disintegrate", 6, 11)).toEqual({
        expression: "10d6+40",
        type: "force",
      });
    });

    it("disintegrate 13d6+40 at slot 7 (+3d6 per slot above)", () => {
      expect(getSpellDamage("disintegrate", 7, 13)).toEqual({
        expression: "13d6+40",
        type: "force",
      });
    });
  });

  describe("Finger of Death / Delayed Blast Fireball", () => {
    it("finger-of-death 7d8+30 (fixed)", () => {
      expect(getSpellDamage("finger-of-death", 7, 13)).toEqual({
        expression: "7d8+30",
        type: "necrotic",
      });
    });

    it("delayed-blast-fireball 12d6 at slot 7", () => {
      expect(getSpellDamage("delayed-blast-fireball", 7, 13)).toEqual({
        expression: "12d6",
        type: "fire",
      });
    });
  });

  describe("Cantrips", () => {
    it("fire-bolt scales 1d10 → 2d10 → 3d10 → 4d10 at levels 1/5/11/17", () => {
      expect(getSpellDamage("fire-bolt", 0, 1)).toEqual({
        expression: "1d10",
        type: "fire",
      });
      expect(getSpellDamage("fire-bolt", 0, 5)).toEqual({
        expression: "2d10",
        type: "fire",
      });
      expect(getSpellDamage("fire-bolt", 0, 11)).toEqual({
        expression: "3d10",
        type: "fire",
      });
      expect(getSpellDamage("fire-bolt", 0, 17)).toEqual({
        expression: "4d10",
        type: "fire",
      });
    });

    it("sacred-flame scales d8 per tier", () => {
      expect(getSpellDamage("sacred-flame", 0, 5)).toEqual({
        expression: "2d8",
        type: "radiant",
      });
    });
  });

  describe("case-insensitive + misses", () => {
    it("uppercase slug still resolves", () => {
      expect(getSpellDamage("MAGIC-MISSILE", 1, 1)).toEqual({
        expression: "3d4+3",
        type: "force",
      });
    });

    it("unknown spell returns null", () => {
      expect(getSpellDamage("mage-armor", 1, 5)).toBeNull();
      expect(getSpellDamage("unknown-spell", 3, 5)).toBeNull();
    });
  });
});
