import { NotFoundException } from "@nestjs/common";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { createMockRepository } from "src/shared/test-utils/mock-repositories";
import {
  makeCharacter,
  makeCharacterClass,
  makeCharacterAbilityScores,
  makeCharacterState,
  makeCharacterSpell,
  makeCharacterEquipment,
  makeCharacterFeature,
  makeCharacterSkill,
  makeCharacterProficiency,
  makeCharacterOrigin,
  makeLevelUp,
  makeCharacterMagicItem,
  resetIdCounter,
} from "src/shared/test-utils/entity-factories";
import { SpellStatusEnum } from "src/entities/enums";

describe("CharacterSheetService", () => {
  let service: CharacterSheetService;
  let repos: Record<string, ReturnType<typeof createMockRepository>>;

  beforeEach(() => {
    resetIdCounter();
    repos = {
      character: createMockRepository(),
      partyMember: createMockRepository(),
      charClass: createMockRepository(),
      charAbility: createMockRepository(),
      charSkill: createMockRepository(),
      charProf: createMockRepository(),
      charSpell: createMockRepository(),
      charEquip: createMockRepository(),
      charMagicItem: createMockRepository(),
      charState: createMockRepository(),
      charLevelUp: createMockRepository(),
      charFeature: createMockRepository(),
      charOrigin: createMockRepository(),
      raceTrait: createMockRepository(),
      level: createMockRepository(),
      classSavingThrow: createMockRepository(),
      classProf: createMockRepository(),
      equipCatItem: createMockRepository(),
      skill: createMockRepository(),
    };

    service = new CharacterSheetService(
      repos.character as any,
      repos.partyMember as any,
      repos.charClass as any,
      repos.charAbility as any,
      repos.charSkill as any,
      repos.charProf as any,
      repos.charSpell as any,
      repos.charEquip as any,
      repos.charMagicItem as any,
      repos.charState as any,
      repos.charLevelUp as any,
      repos.charFeature as any,
      repos.charOrigin as any,
      repos.raceTrait as any,
      repos.level as any,
      repos.classSavingThrow as any,
      repos.classProf as any,
      repos.equipCatItem as any,
      repos.skill as any,
    );
  });

  const setupBasicSheet = (
    classSlug = "fighter",
    classLevel = 1,
    abilityOverrides: Partial<Record<string, number>> = {},
    extraSetup?: () => void,
  ) => {
    const cc = makeCharacterClass(classSlug, classLevel);
    const abilities = makeCharacterAbilityScores(abilityOverrides);
    const state = makeCharacterState({ current_hp: 10 });
    const origin = makeCharacterOrigin();

    repos.character.findOne!.mockResolvedValue(makeCharacter());
    repos.charClass.find!.mockResolvedValue([cc]);
    repos.charAbility.find!.mockResolvedValue(abilities);
    repos.charSkill.find!.mockResolvedValue([]);
    repos.charProf.find!.mockResolvedValue([]);
    repos.charSpell.find!.mockResolvedValue([]);
    repos.charEquip.find!.mockResolvedValue([]);
    repos.charMagicItem.find!.mockResolvedValue([]);
    repos.charState.findOne!.mockResolvedValue(state);
    repos.charLevelUp.find!.mockResolvedValue([]);
    repos.charFeature.find!.mockResolvedValue([]);
    repos.charOrigin.findOne!.mockResolvedValue(origin);
    repos.raceTrait.find!.mockResolvedValue([]);
    repos.classSavingThrow.createQueryBuilder!.mockReturnValue({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
    repos.classProf.createQueryBuilder!.mockReturnValue({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
    repos.equipCatItem.find!.mockResolvedValue([]);
    repos.skill.find!.mockResolvedValue([]);

    extraSetup?.();

    return { cc, abilities, state, origin };
  };

  describe("Ability modifiers", () => {
    it.each([
      { score: 10, expected: 0 },
      { score: 14, expected: 2 },
      { score: 8, expected: -1 },
      { score: 20, expected: 5 },
      { score: 1, expected: -5 },
    ])(
      "score $score should have modifier $expected",
      async ({ score, expected }) => {
        setupBasicSheet("fighter", 1, { str: score });
        const sheet = await service.computeSheet("user-1", "char-1");
        const strBlock = sheet.abilityScores.find((a) => a.slug === "str");
        expect(strBlock?.modifier).toBe(expected);
      },
    );
  });

  describe("Proficiency bonus", () => {
    it.each([
      { level: 1, expected: 2 },
      { level: 5, expected: 3 },
      { level: 9, expected: 4 },
      { level: 13, expected: 5 },
      { level: 17, expected: 6 },
    ])(
      "level $level should have proficiency bonus $expected",
      async ({ level, expected }) => {
        setupBasicSheet("fighter", level);
        const sheet = await service.computeSheet("user-1", "char-1");
        expect(sheet.proficiencyBonus).toBe(expected);
      },
    );
  });

  describe("Orc species traits", () => {
    it("prefers Orc Darkvision 120 ft and exposes both limited-use resources", async () => {
      const { origin, state } = setupBasicSheet("fighter", 10);
      origin.race = { slug: "orc", name: "Orc", speed: 30 };
      state.feature_uses_used = {
        "adrenaline-rush": 1,
        "relentless-endurance": 1,
      };
      repos.raceTrait.find!.mockResolvedValue([
        {
          trait: {
            slug: "darkvision",
            name: "Darkvision",
            description: ["You can see in dim light within 60 feet."],
            source: { code: "XPHB" },
          },
        },
        {
          trait: {
            slug: "darkvision-orc",
            name: "Darkvision",
            description: ["You can see in dim light within 120 feet."],
            source: { code: "SRD" },
          },
        },
        {
          trait: {
            slug: "adrenaline-rush",
            name: "Adrenaline Rush",
            description: ["Dash and gain temporary Hit Points."],
            source: { code: "XPHB" },
          },
        },
        {
          trait: {
            slug: "relentless-endurance",
            name: "Relentless Endurance",
            description: ["Drop to 1 Hit Point instead."],
            source: { code: "XPHB" },
          },
        },
      ]);

      const sheet = await service.computeSheet("user-1", "char-1");
      const darkvision = sheet.features.filter(
        (feature) => feature.slug === "darkvision",
      );
      const adrenalineRush = sheet.features.find(
        (feature) => feature.slug === "adrenaline-rush",
      );
      const relentlessEndurance = sheet.features.find(
        (feature) => feature.slug === "relentless-endurance",
      );

      expect(darkvision).toHaveLength(1);
      expect(darkvision[0].displayText).toContain("120 feet");
      expect(adrenalineRush?.resourceCharges).toEqual({
        current: 3,
        max: 4,
        formula: "Bônus de Proficiência",
        recharge: "short",
      });
      expect(relentlessEndurance?.resourceCharges).toEqual({
        current: 0,
        max: 1,
        formula: "1 uso",
        recharge: "long",
      });
    });

    it("uses Orc raw definitions instead of polluted legacy links", async () => {
      const { origin } = setupBasicSheet("fighter", 1);
      origin.race = {
        slug: "orc",
        name: "Orc",
        speed: 30,
        source: { code: "XPHB" },
        raw: {
          source: "XPHB",
          entries: [
            {
              type: "entries",
              name: "Darkvision",
              entries: [
                "You have Darkvision with a range of 120 feet.",
              ],
            },
          ],
        },
      };
      repos.raceTrait.find!.mockResolvedValue([
        {
          trait: {
            slug: "darkvision",
            name: "Darkvision",
            description: ["Wrong legacy range: 60 feet."],
            source: { code: "XPHB" },
          },
        },
      ]);

      const sheet = await service.computeSheet("user-1", "char-1");
      const darkvision = sheet.features.filter(
        (feature) => feature.slug === "darkvision",
      );

      expect(darkvision).toHaveLength(1);
      expect(darkvision[0].displayText).toContain("120 feet");
      expect(darkvision[0].displayText).not.toContain(
        "Wrong legacy range",
      );
    });
  });

  describe("Goliath species traits", () => {
    it("preserves the selected Giant Ancestry and its resource from race raw", async () => {
      const { origin, state } = setupBasicSheet("fighter", 5);
      origin.race = {
        slug: "goliath",
        name: "Goliath",
        speed: 35,
        source: { code: "XPHB" },
        raw: {
          source: "XPHB",
          entries: [
            {
              type: "entries",
              name: "Giant Ancestry",
              entries: ["Choose one supernatural boon."],
            },
          ],
        },
      };
      origin.race_trait_choices = ["Stone Giant"];
      state.feature_uses_used = { "giant-ancestry": 1 };
      repos.raceTrait.find!.mockResolvedValue([
        {
          trait: {
            slug: "giant-ancestry",
            name: "Wrong catalog fallback",
            description: ["This polluted row must not win."],
            source: { code: "XPHB" },
          },
        },
      ]);

      const sheet = await service.computeSheet("user-1", "char-1");
      const ancestry = sheet.features.find(
        (feature) => feature.slug === "giant-ancestry",
      );

      expect(ancestry).toMatchObject({
        name: "Ancestralidade Gigante — Resistência da Pedra",
        sourceCode: "XPHB",
        sourceClass: "Goliath",
        category: "resource",
        active: true,
        resourceCharges: {
          current: 2,
          max: 3,
          formula: "Bônus de Proficiência",
          recharge: "long",
        },
      });
      expect(ancestry?.displayText).toContain(
        "reduzir o dano por esse total",
      );
    });
  });

  describe("Human PHB species traits", () => {
    const humanRace = {
      id: "race-human-phb",
      slug: "human-phb",
      name: "Human",
      speed: 30,
      source: { code: "PHB" },
      raw: {
        source: "PHB",
        entries: [
          {
            type: "entries",
            name: "Age",
            entries: [
              "Humans reach adulthood in their late teens and live less than a century.",
            ],
          },
          {
            type: "entries",
            name: "Size",
            entries: ["Humans vary widely in height and build."],
          },
          {
            type: "entries",
            name: "Languages",
            entries: [
              "You can speak, read, and write Common and one extra language of your choice.",
            ],
          },
        ],
      },
    };

    it("uses the selected race raw ownership and rejects polluted race links", async () => {
      const { origin } = setupBasicSheet("ranger-phb", 1);
      origin.race_id = humanRace.id;
      origin.race = humanRace;
      origin.subrace_id = undefined;
      origin.subrace = undefined;
      repos.raceTrait.find!.mockResolvedValue([
        {
          trait: {
            slug: "age-phb",
            name: "Age",
            description: ["Young dragonborn grow quickly."],
            source: { code: "PHB" },
          },
        },
        {
          trait: {
            slug: "languages-phb",
            name: "Languages",
            description: ["You know Common and Draconic."],
            source: { code: "PHB" },
          },
        },
        {
          trait: {
            slug: "feat-phb",
            name: "Feat",
            description: ["You gain one feat of your choice."],
            source: { code: "PHB" },
          },
        },
        {
          trait: {
            slug: "artisans-intuition-erlw",
            name: "Artisan's Intuition",
            description: ["Roll a d4."],
            source: { code: "ERLW" },
          },
        },
        {
          trait: {
            slug: "age-psd",
            name: "Age",
            description: ["Aven reach adulthood in their late teens."],
            source: { code: "PSD" },
          },
        },
      ]);

      const sheet = await service.computeSheet("user-1", "char-1");
      const humanTraits = sheet.features.filter(
        (feature) => feature.sourceClass === "Human",
      );

      expect(
        humanTraits.map(({ slug, name, sourceCode }) => ({
          slug,
          name,
          sourceCode,
        })),
      ).toEqual([
        { slug: "age", name: "Age", sourceCode: "PHB" },
        {
          slug: "languages",
          name: "Languages",
          sourceCode: "PHB",
        },
      ]);
      expect(humanTraits[0].displayText).toBe(
        "Humans reach adulthood in their late teens and live less than a century.",
      );
      expect(humanTraits[1].displayText).toBe(
        "You can speak, read, and write Common and one extra language of your choice.",
      );
    });

    it("adds only the explicitly selected Human variant traits", async () => {
      const { origin } = setupBasicSheet("ranger-phb", 1);
      origin.race_id = humanRace.id;
      origin.race = humanRace;
      origin.subrace_id = "subrace-human-variant-phb";
      origin.subrace = {
        id: origin.subrace_id,
        slug: "human-variant-phb",
        name: "Variant",
        source: { code: "PHB" },
        raw: {
          source: "PHB",
          entries: [
            {
              type: "entries",
              name: "Skills",
              entries: [
                "You gain proficiency in one skill of your choice.",
              ],
            },
            {
              type: "entries",
              name: "Feat",
              entries: ["You gain one feat of your choice."],
            },
          ],
        },
      };
      repos.raceTrait.find!.mockResolvedValue([]);

      const sheet = await service.computeSheet("user-1", "char-1");
      const humanTraitSlugs = sheet.features
        .filter((feature) => feature.sourceClass === "Human")
        .map((feature) => feature.slug);

      expect(humanTraitSlugs).toEqual([
        "age",
        "languages",
        "skills",
        "feat",
      ]);
    });
  });

  describe("Max HP", () => {
    it("level 1 fighter with CON 10: hit_die(10) + conMod(0) = 10", async () => {
      setupBasicSheet("fighter", 1, { con: 10 });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.maxHp).toBe(10);
    });

    it("level 1 fighter with CON 14: 10 + 2 = 12", async () => {
      setupBasicSheet("fighter", 1, { con: 14 });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.maxHp).toBe(12);
    });

    it("level 1 wizard with CON 8: 6 + (-1) = 5", async () => {
      setupBasicSheet("wizard", 1, { con: 8 });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.maxHp).toBe(5);
    });

    it("should include level-up HP gains", async () => {
      const { state } = setupBasicSheet("fighter", 3, { con: 10 });
      repos.charLevelUp.find!.mockResolvedValue([
        makeLevelUp("fighter", 2, 6),
        makeLevelUp("fighter", 3, 6),
      ]);
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.maxHp).toBe(10 + 6 + 6);
    });

    it("should include max_hp_bonus from state", async () => {
      setupBasicSheet("fighter", 1, { con: 10 });
      repos.charState.findOne!.mockResolvedValue(
        makeCharacterState({ current_hp: 15, max_hp_bonus: 5 }),
      );
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.maxHp).toBe(15);
    });
  });

  describe("Armor Class", () => {
    it("no armor: 10 + DEX mod", async () => {
      setupBasicSheet("fighter", 1, { dex: 14 });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.armorClass).toBe(12);
    });

    it("light armor (AC base 11): 11 + DEX mod", async () => {
      setupBasicSheet("fighter", 1, { dex: 14 }, () => {
        repos.charEquip.find!.mockResolvedValue([
          makeCharacterEquipment("leather-armor", {
            equipped: true,
            equipmentOverrides: {
              armor_class: { base: 11, dex_bonus: true },
              weight: "10",
            },
          }),
        ]);
      });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.armorClass).toBe(13);
    });

    it("medium armor (AC base 13): 13 + min(DEX mod, 2)", async () => {
      setupBasicSheet("fighter", 1, { dex: 18 }, () => {
        repos.charEquip.find!.mockResolvedValue([
          makeCharacterEquipment("chain-shirt", {
            equipped: true,
            equipmentOverrides: {
              armor_class: { base: 13, dex_bonus: true, max_bonus: 2 },
              weight: "20",
            },
          }),
        ]);
      });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.armorClass).toBe(15);
    });

    it("heavy armor (AC base 16): ignores DEX", async () => {
      setupBasicSheet("fighter", 1, { dex: 18 }, () => {
        repos.charEquip.find!.mockResolvedValue([
          makeCharacterEquipment("chain-mail", {
            equipped: true,
            equipmentOverrides: {
              armor_class: { base: 16, dex_bonus: false },
              weight: "55",
            },
          }),
        ]);
      });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.armorClass).toBe(16);
    });

    it("shield adds +2 to AC", async () => {
      setupBasicSheet("fighter", 1, { dex: 14 }, () => {
        repos.charEquip.find!.mockResolvedValue([
          makeCharacterEquipment("shield", {
            equipped: true,
            equipmentOverrides: {
              armor_class: { base: 0 },
              weight: "6",
            },
          }),
        ]);
      });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.armorClass).toBe(14);
    });
  });

  describe("Spell slots", () => {
    it("wizard level 5 (full caster): [4,3,2]", async () => {
      setupBasicSheet("wizard", 5, { int: 16 });
      const sheet = await service.computeSheet("user-1", "char-1");
      const slotLevels = sheet.spellSlots.map((s) => s.total);
      expect(slotLevels).toEqual([4, 3, 2]);
    });

    it("paladin level 5 uses its class table: [4,2]", async () => {
      setupBasicSheet("paladin", 5, { cha: 16 });
      const sheet = await service.computeSheet("user-1", "char-1");
      const slotLevels = sheet.spellSlots.map((s) => s.total);
      expect(slotLevels).toEqual([4, 2]);
    });

    it("2024 paladin level 1 starts with spell slots", async () => {
      setupBasicSheet("paladin", 1, { cha: 16 });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.spellSlots.map((s) => s.total)).toEqual([2]);
    });

    it("2014 paladin level 1 has no spell slots", async () => {
      setupBasicSheet("paladin-phb", 1, { cha: 16 });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.spellSlots).toEqual([]);
    });

    it("warlock level 5: pact slot {level: 3, slots: 2}", async () => {
      setupBasicSheet("warlock", 5, { cha: 16 });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.spellSlots).toHaveLength(1);
      expect(sheet.spellSlots[0].level).toBe(3);
      expect(sheet.spellSlots[0].total).toBe(2);
    });

    it("fighter level 5 (non-caster): no spell slots", async () => {
      setupBasicSheet("fighter", 5);
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.spellSlots).toEqual([]);
    });
  });

  describe("Skills", () => {
    it("proficient skill: base mod + proficiency bonus", async () => {
      const charSkill = makeCharacterSkill("stealth", "dex", false);
      setupBasicSheet("fighter", 1, { dex: 14 }, () => {
        repos.charSkill.find!.mockResolvedValue([charSkill]);
        repos.skill.find!.mockResolvedValue([
          {
            id: charSkill.skill_id,
            slug: "stealth",
            name: "Stealth",
            ability_score: { slug: "dex" },
          },
        ]);
      });
      const sheet = await service.computeSheet("user-1", "char-1");
      const stealth = sheet.skills.find((s) => s.slug === "stealth");
      expect(stealth?.bonus).toBe(4);
    });

    it("expertise skill: base mod + 2x proficiency bonus", async () => {
      const charSkill = makeCharacterSkill("stealth", "dex", true);
      setupBasicSheet("rogue", 1, { dex: 16 }, () => {
        repos.charSkill.find!.mockResolvedValue([charSkill]);
        repos.skill.find!.mockResolvedValue([
          {
            id: charSkill.skill_id,
            slug: "stealth",
            name: "Stealth",
            ability_score: { slug: "dex" },
          },
        ]);
      });
      const sheet = await service.computeSheet("user-1", "char-1");
      const stealth = sheet.skills.find((s) => s.slug === "stealth");
      expect(stealth?.bonus).toBe(7);
    });
  });

  describe("Passive Perception", () => {
    it("non-proficient: 10 + WIS mod", async () => {
      setupBasicSheet("fighter", 1, { wis: 14 });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.passivePerception).toBe(12);
    });

    it("proficient: 10 + WIS mod + proficiency bonus", async () => {
      setupBasicSheet("fighter", 1, { wis: 14 }, () => {
        repos.charSkill.find!.mockResolvedValue([
          makeCharacterSkill("perception", "wis", false),
        ]);
      });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.passivePerception).toBe(14);
    });
  });

  describe("Species speed", () => {
    it("uses a subrace speed override when present", async () => {
      const { origin } = setupBasicSheet();
      (origin as any).subrace = {
        slug: "elf-wood-phb",
        name: "Wood",
        raw: { speed: 35 },
      };

      const sheet = await service.computeSheet("user-1", "char-1");

      expect(sheet.speed).toBe(35);
    });
  });

  describe("Carrying capacity", () => {
    it("STR 10: capacity = 150", async () => {
      setupBasicSheet("fighter", 1, { str: 10 });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.carryingCapacity).toBe(150);
    });

    it("STR 16: capacity = 240", async () => {
      setupBasicSheet("fighter", 1, { str: 16 });
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.carryingCapacity).toBe(240);
    });
  });

  describe("XP level-up detection", () => {
    it("should show canLevelUp=true when xp >= threshold", async () => {
      setupBasicSheet("fighter", 1);
      repos.charState.findOne!.mockResolvedValue(
        makeCharacterState({ xp: 300 }),
      );
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.levelUpAvailable).toBe(true);
    });

    it("should show canLevelUp=false when xp < threshold", async () => {
      setupBasicSheet("fighter", 1);
      repos.charState.findOne!.mockResolvedValue(
        makeCharacterState({ xp: 100 }),
      );
      const sheet = await service.computeSheet("user-1", "char-1");
      expect(sheet.levelUpAvailable).toBe(false);
    });
  });

  describe("Always-prepared Paladin spells", () => {
    it("adds Paladin's Smite and the level-15 Devotion table to the sheet", async () => {
      const { cc } = setupBasicSheet("paladin", 15);
      cc.subclass = {
        slug: "paladin-devotion",
        name: "Oath of Devotion",
      } as never;

      const sheet = await service.computeSheet("user-1", "char-1");
      const alwaysPrepared = sheet.spells
        .filter((spell) => spell.alwaysPrepared)
        .map((spell) => spell.slug);

      expect(alwaysPrepared).toEqual([
        "divine-smite",
        "find-steed",
        "protection-from-evil-and-good",
        "shield-of-faith",
        "aid",
        "zone-of-truth",
        "beacon-of-hope",
        "dispel-magic",
        "freedom-of-movement",
        "guardian-of-faith",
      ]);
    });

    it("does not add the XPHB table to a PHB Paladin", async () => {
      const { cc } = setupBasicSheet("paladin", 15);
      cc.subclass = {
        slug: "devotion",
        name: "Devotion",
      } as never;
      repos.character.findOne!.mockResolvedValue(
        makeCharacter({ source: { code: "PHB" } }),
      );

      const sheet = await service.computeSheet("user-1", "char-1");

      expect(sheet.spells).toEqual([]);
    });
  });

  describe("Error handling", () => {
    it("should throw NotFoundException if character not found", async () => {
      repos.character.findOne!.mockResolvedValue(null);
      await expect(service.computeSheet("user-1", "char-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
