import { NotFoundException } from "@nestjs/common";
import { ActionsService } from "src/models/characters/services/actions.service";
import { createMockRepository } from "src/shared/test-utils/mock-repositories";
import {
  makeCharacter,
  makeCharacterClass,
  makeCharacterAbilityScores,
  makeCharacterState,
  makeCharacterEquipment,
  makeCharacterFeature,
  makeCharacterSpell,
  makeCharacterProficiency,
  makeCharacterOrigin,
  resetIdCounter,
} from "src/shared/test-utils/entity-factories";
import { ProficiencyTypeEnum, SpellStatusEnum } from "src/entities/enums";

describe("ActionsService", () => {
  let service: ActionsService;
  let repos: Record<string, ReturnType<typeof createMockRepository>>;

  beforeEach(() => {
    resetIdCounter();
    repos = {
      character: createMockRepository(),
      partyMember: createMockRepository(),
      charClass: createMockRepository(),
      charAbility: createMockRepository(),
      charProf: createMockRepository(),
      charSpell: createMockRepository(),
      charEquip: createMockRepository(),
      charFeature: createMockRepository(),
      charState: createMockRepository(),
      equipCatItem: createMockRepository(),
      classProf: createMockRepository(),
    };

    service = new ActionsService(
      repos.character as any,
      repos.partyMember as any,
      repos.charClass as any,
      repos.charAbility as any,
      repos.charProf as any,
      repos.charSpell as any,
      repos.charEquip as any,
      repos.charFeature as any,
      repos.charState as any,
      repos.equipCatItem as any,
      repos.classProf as any,
    );
  });

  const setupActions = (
    opts: {
      classSlug?: string;
      level?: number;
      str?: number;
      dex?: number;
      wis?: number;
      cha?: number;
      int?: number;
      equip?: any[];
      spells?: any[];
      features?: any[];
      proficiencies?: any[];
    } = {},
  ) => {
    const classSlug = opts.classSlug ?? "fighter";
    const level = opts.level ?? 1;
    const cc = makeCharacterClass(classSlug, level);
    const abilities = makeCharacterAbilityScores({
      str: opts.str ?? 16,
      dex: opts.dex ?? 14,
      wis: opts.wis ?? 10,
      cha: opts.cha ?? 10,
      int: opts.int ?? 10,
    });
    const state = makeCharacterState();
    const origin = makeCharacterOrigin();
    const character = makeCharacter({ character_origin: origin });

    repos.character.findOne!.mockResolvedValue(character);
    repos.charClass.find!.mockResolvedValue([cc]);
    repos.charAbility.find!.mockResolvedValue(abilities);
    repos.charProf.find!.mockResolvedValue(opts.proficiencies ?? []);
    repos.charSpell.find!.mockResolvedValue(opts.spells ?? []);
    const equip = opts.equip ?? [];
    repos.charEquip.find!.mockResolvedValue(equip);
    repos.charFeature.find!.mockResolvedValue(opts.features ?? []);
    repos.charState.findOne!.mockResolvedValue(state);

    const catItems = equip
      .filter((ce: any) => ce.equipment?.damage)
      .map((ce: any) => ({
        equipment_id: ce.equipment_id,
        category_id: "cat-1",
        category: {
          slug: ce.equipment?.properties?.some(
            (p: any) => p === "finesse" || p?.slug === "finesse",
          )
            ? "martial-melee-weapons"
            : ce.equipment?.range?.normal
              ? "simple-ranged-weapons"
              : "martial-melee-weapons",
        },
      }));
    repos.equipCatItem.find!.mockResolvedValue(catItems);
    repos.classProf.createQueryBuilder!.mockReturnValue({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });

    return { cc, abilities, state, origin };
  };

  describe("Weapon attacks", () => {
    it("should create action for equipped weapon with STR-based attack", async () => {
      setupActions({
        str: 16,
        dex: 14,
        equip: [
          makeCharacterEquipment("longsword", {
            equipped: true,
            equipmentOverrides: {
              damage: { damage_dice: "1d8", damage_type: { name: "Slashing" } },
              properties: [],
              weight: "3",
            },
          }),
        ],
        proficiencies: [
          makeCharacterProficiency("longswords", ProficiencyTypeEnum.Weapon),
        ],
      });

      const result = await service.getActions("user-1", "char-1");
      const weapon = result.actions.find((a) => a.name === "Longsword");

      expect(weapon).toBeDefined();
      expect(weapon!.attackBonus).toBe(3 + 2);
      expect(weapon!.damage?.bonus).toBe(3);
      expect(weapon!.source).toBe("weapon");
    });

    it("should use DEX for ranged weapons", async () => {
      setupActions({
        str: 10,
        dex: 18,
        equip: [
          makeCharacterEquipment("shortbow", {
            equipped: true,
            equipmentOverrides: {
              damage: { damage_dice: "1d6", damage_type: { name: "Piercing" } },
              properties: [{ index: "ammunition", name: "Ammunition" }],
              range: { normal: 80, long: 320 },
              weight: "2",
            },
          }),
        ],
        proficiencies: [
          makeCharacterProficiency("shortbows", ProficiencyTypeEnum.Weapon),
        ],
      });

      const result = await service.getActions("user-1", "char-1");
      const weapon = result.actions.find((a) => a.name === "Shortbow");

      expect(weapon).toBeDefined();
      expect(weapon!.attackBonus).toBe(4 + 2);
      expect(weapon!.damage?.bonus).toBe(4);
    });

    it("should use max(STR, DEX) for finesse weapons", async () => {
      setupActions({
        str: 12,
        dex: 18,
        equip: [
          makeCharacterEquipment("rapier", {
            equipped: true,
            equipmentOverrides: {
              damage: { damage_dice: "1d8", damage_type: { name: "Piercing" } },
              properties: [{ index: "finesse", name: "Finesse" }],
              weight: "2",
            },
          }),
        ],
        proficiencies: [
          makeCharacterProficiency("rapiers", ProficiencyTypeEnum.Weapon),
        ],
      });

      const result = await service.getActions("user-1", "char-1");
      const weapon = result.actions.find((a) => a.name === "Rapier");

      expect(weapon).toBeDefined();
      expect(weapon!.attackBonus).toBe(4 + 2);
      expect(weapon!.damage?.bonus).toBe(4);
    });

    it("should not include unequipped weapons", async () => {
      setupActions({
        equip: [
          makeCharacterEquipment("longsword", {
            equipped: false,
            equipmentOverrides: {
              damage: { damage_dice: "1d8", damage_type: { name: "Slashing" } },
              properties: [],
              weight: "3",
            },
          }),
        ],
      });

      const result = await service.getActions("user-1", "char-1");
      const weapon = result.actions.find((a) => a.source === "weapon");

      expect(weapon).toBeUndefined();
    });
  });

  describe("Unarmed Strike", () => {
    it("should always include unarmed strike action", async () => {
      setupActions({ str: 14 });

      const result = await service.getActions("user-1", "char-1");
      const unarmed = result.actions.find((a) => a.id === "unarmed-strike");

      expect(unarmed).toBeDefined();
      expect(unarmed!.attackBonus).toBe(2 + 2);
    });

    it("monk should use martial arts die with max(STR, DEX)", async () => {
      setupActions({
        classSlug: "monk",
        level: 5,
        str: 10,
        dex: 18,
      });

      const result = await service.getActions("user-1", "char-1");
      const unarmed = result.actions.find((a) => a.id === "unarmed-strike");

      expect(unarmed).toBeDefined();
      expect(unarmed!.damage?.dice).toBe("1d8");
      expect(unarmed!.attackBonus).toBe(4 + 3);
    });

    it.each([
      { level: 1, die: "1d6" },
      { level: 5, die: "1d8" },
      { level: 11, die: "1d10" },
      { level: 17, die: "1d12" },
    ])(
      "monk level $level should use $die martial arts die",
      async ({ level, die }) => {
        setupActions({ classSlug: "monk", level, dex: 16 });

        const result = await service.getActions("user-1", "char-1");
        const unarmed = result.actions.find((a) => a.id === "unarmed-strike");

        expect(unarmed!.damage?.dice).toBe(die);
      },
    );
  });

  describe("Cantrip scaling", () => {
    it("cantrip damage should scale with character level", async () => {
      const spell = {
        id: "spell-fb",
        slug: "fire-bolt",
        name: "Fire Bolt",
        level: 0,
        description: ["You hurl a firebolt..."],
        casting_time: "1 action",
        range: "120 feet",
        concentration: false,
        ritual: false,
        attack_type: "ranged",
        damage: {
          damage_type: { name: "Fire" },
          damage_at_character_level: {
            "1": "1d10",
            "5": "2d10",
            "11": "3d10",
            "17": "4d10",
          },
        },
        dc: null,
        school: null,
        components: { V: true, S: true },
        duration: "Instantaneous",
      };

      setupActions({
        classSlug: "wizard",
        level: 5,
        int: 16,
        spells: [
          {
            id: "cs-1",
            character_id: "char-1",
            spell_id: spell.id,
            source: "class",
            status: SpellStatusEnum.Known,
            always_prepared: true,
            spell,
          },
        ],
      });

      const result = await service.getActions("user-1", "char-1");
      const firebolt = result.actions.find((a) => a.name === "Fire Bolt");

      expect(firebolt).toBeDefined();
      expect(firebolt!.damage?.dice).toBe("2d10");
      expect(firebolt!.source).toBe("spell");
      expect(firebolt!.automationStatus).toBe("ready");
      expect(firebolt!.behaviorKind).toBe("attack_damage");
    });

    it("should hide spells outside the finite automation catalog", async () => {
      const spell = {
        id: "spell-unmodeled",
        slug: "unmodeled-spell",
        name: "Unmodeled Spell",
        level: 1,
        description: ["This spell is not released for combat automation."],
        casting_time: "1 action",
        range: "60 feet",
        concentration: false,
        ritual: false,
        attack_type: "ranged",
        damage: {
          damage_type: { name: "Force" },
          damage_at_slot_level: { "1": "1d4" },
        },
        dc: null,
        school: null,
        components: { V: true, S: true },
        duration: "Instantaneous",
      };

      setupActions({
        classSlug: "wizard",
        level: 5,
        int: 16,
        spells: [
          {
            id: "cs-unmodeled",
            character_id: "char-1",
            spell_id: spell.id,
            source: "class",
            status: SpellStatusEnum.Prepared,
            always_prepared: true,
            spell,
          },
        ],
      });

      const result = await service.getActions("user-1", "char-1");
      const hidden = result.actions.find((a) => a.name === "Unmodeled Spell");

      expect(hidden).toBeUndefined();
    });
  });

  describe("Spell save DC & attack bonus", () => {
    it("should compute spell save DC for caster", async () => {
      setupActions({
        classSlug: "wizard",
        level: 5,
        int: 18,
      });

      const result = await service.getActions("user-1", "char-1");


      expect(result.summary.spellSaveDc.wizard).toBe(15);
      expect(result.summary.spellAttackBonus.wizard).toBe(7);
    });

    it("non-caster should have no spell save DC", async () => {
      setupActions({ classSlug: "fighter", level: 5 });

      const result = await service.getActions("user-1", "char-1");

      expect(result.summary.spellSaveDc).toEqual({});
    });
  });

  describe("Unarmed Strike", () => {
    it("should expose unarmed-strike as a single action (grapple/shove are sub-modes via runtime)", async () => {
      setupActions();

      const result = await service.getActions("user-1", "char-1");
      const allActionIds = [
        ...result.actions.map((a) => a.id),
        ...result.bonusActions.map((a) => a.id),
        ...result.reactions.map((a) => a.id),
      ];

      expect(allActionIds).toContain("unarmed-strike");
      expect(allActionIds).not.toContain("unarmed-grapple");
      expect(allActionIds).not.toContain("unarmed-shove");
    });

    it("should not leak generic base actions (Dash, Dodge, etc) into the character actions list", async () => {
      setupActions();

      const result = await service.getActions("user-1", "char-1");
      const allActionIds = [
        ...result.actions.map((a) => a.id),
        ...result.bonusActions.map((a) => a.id),
        ...result.reactions.map((a) => a.id),
      ];


      expect(allActionIds).not.toContain("base-dash");
      expect(allActionIds).not.toContain("base-dodge");
      expect(allActionIds).not.toContain("base-disengage");
      expect(allActionIds).not.toContain("base-help");
      expect(allActionIds).not.toContain("base-hide");
      expect(allActionIds).not.toContain("base-search");
      expect(allActionIds).not.toContain("base-study");
      expect(allActionIds).not.toContain("base-utilize");
      expect(allActionIds).not.toContain("base-ready");
      expect(allActionIds).not.toContain("base-influence");
      expect(allActionIds).not.toContain("base-opportunity-attack");
    });
  });

  describe("Extra attack", () => {
    it("should not detect extra attack without the feature", async () => {
      setupActions({ classSlug: "fighter", level: 4 });

      const result = await service.getActions("user-1", "char-1");

      expect(result.summary.hasExtraAttack).toBe(false);
      expect(result.summary.attackCount).toBe(1);
    });

    it("should detect extra attack when feature is present", async () => {
      setupActions({
        classSlug: "fighter",
        level: 5,
        features: [
          makeCharacterFeature("extra-attack", "fighter", {
            featureOverrides: {
              slug: "extra-attack",
              name: "Extra Attack",
              level: 5,
            },
          }),
        ],
      });

      const result = await service.getActions("user-1", "char-1");

      expect(result.summary.hasExtraAttack).toBe(true);
      expect(result.summary.attackCount).toBe(2);
    });
  });

  describe("Movement", () => {
    it("should return speed from race (default 30)", async () => {
      setupActions();

      const result = await service.getActions("user-1", "char-1");

      expect(result.movement.speed).toBe(30);
    });
  });

  describe("Error handling", () => {
    it("should throw NotFoundException for missing character", async () => {
      repos.character.findOne!.mockResolvedValue(null);

      await expect(service.getActions("user-1", "no-char")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
