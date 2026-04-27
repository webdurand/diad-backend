import type { CharacterSheet } from "../../characters/services/character-sheet.service";
import {
  getSpellcastingModifier,
  substituteSpellcastingMod,
} from "./spellcasting-mod";

/**
 * Regressão: heal_at_slot_level no DB SRD inclui placeholder `MOD`
 * (ex: "1d4 + MOD" em Healing Word). DiceService não entende placeholder —
 * sem substituição, rolls retornam 0 e cura quebra silenciosamente.
 */

function buildSheet(overrides: Partial<CharacterSheet>): CharacterSheet {
  return {
    id: "x",
    name: "x",
    race: { slug: "human", name: "Human" },
    background: { slug: "acolyte", name: "Acolyte" },
    personality: {},
    classes: [],
    totalLevel: 1,
    proficiencyBonus: 2,
    abilityScores: [
      { slug: "str", name: "Strength", score: 10, modifier: 0 },
      { slug: "dex", name: "Dexterity", score: 10, modifier: 0 },
      { slug: "con", name: "Constitution", score: 10, modifier: 0 },
      { slug: "int", name: "Intelligence", score: 10, modifier: 0 },
      { slug: "wis", name: "Wisdom", score: 16, modifier: 3 },
      { slug: "cha", name: "Charisma", score: 10, modifier: 0 },
    ],
    maxHp: 10,
    currentHp: 10,
    tempHp: 0,
    armorClass: 10,
    initiative: 0,
    speed: 30,
    hitDice: [],
    carryingCapacity: 0,
    deathSaves: { successes: 0, failures: 0 },
    skills: [],
    passivePerception: 10,
    savingThrows: [],
    proficiencies: [],
    features: [],
    spells: [],
    spellSlots: [],
    xp: 0,
    ...overrides,
  } as unknown as CharacterSheet;
}

describe("spellcasting-mod", () => {
  describe("getSpellcastingModifier", () => {
    it("retorna mod da ability de spellcasting (cleric/WIS 16 → +3)", () => {
      const sheet = buildSheet({
        classes: [
          {
            slug: "cleric",
            name: "Cleric",
            level: 1,
            hitDie: 8,
            spellcastingAbility: "wis",
            spellSaveDc: 13,
            spellAttackBonus: 5,
          } as never,
        ],
      });
      expect(getSpellcastingModifier(sheet)).toBe(3);
    });

    it("retorna 0 quando não há caster class (Fighter puro)", () => {
      const sheet = buildSheet({
        classes: [
          { slug: "fighter", name: "Fighter", level: 1, hitDie: 10 } as never,
        ],
      });
      expect(getSpellcastingModifier(sheet)).toBe(0);
    });

    it("escolhe primeira caster class em multi-class", () => {
      const sheet = buildSheet({
        classes: [
          { slug: "fighter", name: "Fighter", level: 1, hitDie: 10 } as never,
          {
            slug: "wizard",
            name: "Wizard",
            level: 3,
            hitDie: 6,
            spellcastingAbility: "int",
            spellSaveDc: 13,
          } as never,
        ],
        abilityScores: [
          { slug: "str", name: "Strength", score: 10, modifier: 0 },
          { slug: "dex", name: "Dexterity", score: 10, modifier: 0 },
          { slug: "con", name: "Constitution", score: 10, modifier: 0 },
          { slug: "int", name: "Intelligence", score: 18, modifier: 4 },
          { slug: "wis", name: "Wisdom", score: 10, modifier: 0 },
          { slug: "cha", name: "Charisma", score: 10, modifier: 0 },
        ],
      });
      expect(getSpellcastingModifier(sheet)).toBe(4);
    });
  });

  describe("substituteSpellcastingMod", () => {
    const sheet = buildSheet({
      classes: [
        {
          slug: "cleric",
          name: "Cleric",
          level: 1,
          hitDie: 8,
          spellcastingAbility: "wis",
          spellSaveDc: 13,
        } as never,
      ],
    });

    it("substitui MOD pelo valor numérico", () => {
      expect(substituteSpellcastingMod("1d4 + MOD", sheet)).toBe("1d4 + 3");
    });

    it("é case-insensitive", () => {
      expect(substituteSpellcastingMod("2d4 + mod", sheet)).toBe("2d4 + 3");
      expect(substituteSpellcastingMod("2d4 + Mod", sheet)).toBe("2d4 + 3");
    });

    it("não altera expressão sem MOD", () => {
      expect(substituteSpellcastingMod("3d8", sheet)).toBe("3d8");
    });

    it("aceita mod negativo (STR -1 etc.)", () => {
      const weakSheet = buildSheet({
        classes: [
          {
            slug: "wizard",
            name: "Wizard",
            level: 1,
            hitDie: 6,
            spellcastingAbility: "int",
            spellSaveDc: 10,
          } as never,
        ],
        abilityScores: [
          { slug: "str", name: "Strength", score: 10, modifier: 0 },
          { slug: "dex", name: "Dexterity", score: 10, modifier: 0 },
          { slug: "con", name: "Constitution", score: 10, modifier: 0 },
          { slug: "int", name: "Intelligence", score: 8, modifier: -1 },
          { slug: "wis", name: "Wisdom", score: 10, modifier: 0 },
          { slug: "cha", name: "Charisma", score: 10, modifier: 0 },
        ],
      });
      expect(substituteSpellcastingMod("1d4 + MOD", weakSheet)).toBe(
        "1d4 + -1",
      );
    });
  });
});
