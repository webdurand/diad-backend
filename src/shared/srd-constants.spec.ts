import {
  PROF_BONUS_BY_LEVEL,
  XP_THRESHOLDS,
  FULL_CASTER_SLOTS,
  WARLOCK_SLOTS,
  SPELLCASTING_ABILITY,
  CASTER_SLOT_TYPE,
  CASTER_CLASS_TYPE,
  getStandardCasterLevelContribution,
} from "src/shared/srd-constants";
import {
  SRD_PROFICIENCY_BONUS,
  SRD_XP_THRESHOLDS,
} from "src/shared/test-utils/srd-test-data";

describe("SRD Constants", () => {
  describe("PROF_BONUS_BY_LEVEL", () => {
    it.each(SRD_PROFICIENCY_BONUS)(
      "level $level should have proficiency bonus $bonus",
      ({ level, bonus }) => {
        expect(PROF_BONUS_BY_LEVEL[level]).toBe(bonus);
      },
    );

    it("should cover all 20 levels", () => {
      for (let level = 1; level <= 20; level++) {
        expect(PROF_BONUS_BY_LEVEL[level]).toBeDefined();
      }
    });
  });

  describe("XP_THRESHOLDS", () => {
    it.each(SRD_XP_THRESHOLDS)(
      "level $level should require $xp XP",
      ({ level, xp }) => {
        expect(XP_THRESHOLDS[level - 1]).toBe(xp);
      },
    );

    it("should have exactly 20 entries", () => {
      expect(XP_THRESHOLDS).toHaveLength(20);
    });

    it("should be monotonically increasing", () => {
      for (let i = 1; i < XP_THRESHOLDS.length; i++) {
        expect(XP_THRESHOLDS[i]).toBeGreaterThan(XP_THRESHOLDS[i - 1]);
      }
    });

    it("level 1 XP should be 0", () => {
      expect(XP_THRESHOLDS[0]).toBe(0);
    });

    it("level 20 XP should be 355000", () => {
      expect(XP_THRESHOLDS[19]).toBe(355000);
    });
  });

  describe("FULL_CASTER_SLOTS", () => {
    it("should have 21 entries (index 0 empty + levels 1-20)", () => {
      expect(FULL_CASTER_SLOTS).toHaveLength(21);
    });

    it("index 0 should be empty", () => {
      expect(FULL_CASTER_SLOTS[0]).toEqual([]);
    });

    it("caster level 1: [2] (two 1st-level slots)", () => {
      expect(FULL_CASTER_SLOTS[1]).toEqual([2]);
    });

    it("caster level 3: [4, 2] (four 1st + two 2nd)", () => {
      expect(FULL_CASTER_SLOTS[3]).toEqual([4, 2]);
    });

    it("caster level 5: [4, 3, 2] (access to 3rd-level spells)", () => {
      expect(FULL_CASTER_SLOTS[5]).toEqual([4, 3, 2]);
    });

    it("caster level 9: [4, 3, 3, 3, 1] (5th-level spells)", () => {
      expect(FULL_CASTER_SLOTS[9]).toEqual([4, 3, 3, 3, 1]);
    });

    it("caster level 20: [4, 3, 3, 3, 3, 2, 2, 1, 1] (max slots)", () => {
      expect(FULL_CASTER_SLOTS[20]).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
    });

    it("max spell level at level 20 should be 9", () => {
      expect(FULL_CASTER_SLOTS[20]).toHaveLength(9);
    });
  });

  describe("WARLOCK_SLOTS", () => {
    it("should have 20 entries (levels 1-20)", () => {
      expect(WARLOCK_SLOTS).toHaveLength(20);
    });

    it("level 1: 1 slot at slot level 1", () => {
      expect(WARLOCK_SLOTS[0]).toEqual({ slots: 1, level: 1 });
    });

    it("level 2: 2 slots at slot level 1", () => {
      expect(WARLOCK_SLOTS[1]).toEqual({ slots: 2, level: 1 });
    });

    it("level 5: 2 slots at slot level 3", () => {
      expect(WARLOCK_SLOTS[4]).toEqual({ slots: 2, level: 3 });
    });

    it("level 11: 3 slots at slot level 5", () => {
      expect(WARLOCK_SLOTS[10]).toEqual({ slots: 3, level: 5 });
    });

    it("level 17: 4 slots at slot level 5", () => {
      expect(WARLOCK_SLOTS[16]).toEqual({ slots: 4, level: 5 });
    });

    it("level 20: 4 slots at slot level 5", () => {
      expect(WARLOCK_SLOTS[19]).toEqual({ slots: 4, level: 5 });
    });
  });

  describe("SPELLCASTING_ABILITY", () => {
    it.each([
      ["bard", "cha"],
      ["cleric", "wis"],
      ["druid", "wis"],
      ["paladin", "cha"],
      ["ranger", "wis"],
      ["sorcerer", "cha"],
      ["warlock", "cha"],
      ["wizard", "int"],
    ])("%s should use %s", (classSlug, ability) => {
      expect(SPELLCASTING_ABILITY[classSlug]).toBe(ability);
    });

    it("should have exactly 8 entries (spellcasting classes)", () => {
      expect(Object.keys(SPELLCASTING_ABILITY)).toHaveLength(8);
    });

    it("non-caster classes should not be present", () => {
      expect(SPELLCASTING_ABILITY["fighter"]).toBeUndefined();
      expect(SPELLCASTING_ABILITY["barbarian"]).toBeUndefined();
      expect(SPELLCASTING_ABILITY["monk"]).toBeUndefined();
      expect(SPELLCASTING_ABILITY["rogue"]).toBeUndefined();
    });
  });

  describe("CASTER_SLOT_TYPE", () => {
    it.each([
      ["bard", "full"],
      ["cleric", "full"],
      ["druid", "full"],
      ["sorcerer", "full"],
      ["wizard", "full"],
      ["paladin", "half"],
      ["ranger", "half"],
      ["warlock", "pact"],
    ])("%s should be %s caster", (classSlug, type) => {
      expect(CASTER_SLOT_TYPE[classSlug]).toBe(type);
    });

    it("uses the correct 2014 and 2024 half-caster progression", () => {
      expect(getStandardCasterLevelContribution("paladin", 1, false)).toBe(1);
      expect(getStandardCasterLevelContribution("paladin", 5, false)).toBe(3);
      expect(getStandardCasterLevelContribution("paladin-phb", 1, false)).toBe(
        0,
      );
      expect(getStandardCasterLevelContribution("paladin-phb", 5, false)).toBe(
        3,
      );
      expect(getStandardCasterLevelContribution("paladin-phb", 5, true)).toBe(
        2,
      );
    });
  });

  describe("CASTER_CLASS_TYPE", () => {
    it.each([
      ["cleric", "total_access"],
      ["druid", "total_access"],
      ["paladin", "total_access"],
      ["bard", "known"],
      ["sorcerer", "known"],
      ["ranger", "known"],
      ["warlock", "pact"],
      ["wizard", "spellbook"],
    ])("%s should have spell type %s", (classSlug, type) => {
      expect(CASTER_CLASS_TYPE[classSlug]).toBe(type);
    });
  });
});
