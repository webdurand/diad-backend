import { NotFoundException } from '@nestjs/common';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { createMockRepository } from 'src/shared/test-utils/mock-repositories';
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
} from 'src/shared/test-utils/entity-factories';
import { SpellStatusEnum } from 'src/entities/enums';

describe('CharacterSheetService', () => {
  let service: CharacterSheetService;
  let repos: Record<string, ReturnType<typeof createMockRepository>>;

  beforeEach(() => {
    resetIdCounter();
    repos = {
      character: createMockRepository(),
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
      level: createMockRepository(),
      classSavingThrow: createMockRepository(),
      classProf: createMockRepository(),
      equipCatItem: createMockRepository(),
    };

    service = new CharacterSheetService(
      repos.character as any,
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
      repos.level as any,
      repos.classSavingThrow as any,
      repos.classProf as any,
      repos.equipCatItem as any,
    );
  });

  const setupBasicSheet = (
    classSlug = 'fighter',
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

    extraSetup?.();

    return { cc, abilities, state, origin };
  };

  describe('Ability modifiers', () => {
    it.each([
      { score: 10, expected: 0 },
      { score: 14, expected: 2 },
      { score: 8, expected: -1 },
      { score: 20, expected: 5 },
      { score: 1, expected: -5 },
    ])('score $score should have modifier $expected', async ({ score, expected }) => {
      setupBasicSheet('fighter', 1, { str: score });
      const sheet = await service.computeSheet('user-1', 'char-1');
      const strBlock = sheet.abilityScores.find((a) => a.slug === 'str');
      expect(strBlock?.modifier).toBe(expected);
    });
  });

  describe('Proficiency bonus', () => {
    it.each([
      { level: 1, expected: 2 },
      { level: 5, expected: 3 },
      { level: 9, expected: 4 },
      { level: 13, expected: 5 },
      { level: 17, expected: 6 },
    ])('level $level should have proficiency bonus $expected', async ({ level, expected }) => {
      setupBasicSheet('fighter', level);
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.proficiencyBonus).toBe(expected);
    });
  });

  describe('Max HP', () => {
    it('level 1 fighter with CON 10: hit_die(10) + conMod(0) = 10', async () => {
      setupBasicSheet('fighter', 1, { con: 10 });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.maxHp).toBe(10);
    });

    it('level 1 fighter with CON 14: 10 + 2 = 12', async () => {
      setupBasicSheet('fighter', 1, { con: 14 });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.maxHp).toBe(12);
    });

    it('level 1 wizard with CON 8: 6 + (-1) = 5', async () => {
      setupBasicSheet('wizard', 1, { con: 8 });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.maxHp).toBe(5);
    });

    it('should include level-up HP gains', async () => {
      const { state } = setupBasicSheet('fighter', 3, { con: 10 });
      repos.charLevelUp.find!.mockResolvedValue([
        makeLevelUp('fighter', 2, 6),
        makeLevelUp('fighter', 3, 6),
      ]);
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.maxHp).toBe(10 + 6 + 6); // hit_die + levelups
    });

    it('should include max_hp_bonus from state', async () => {
      setupBasicSheet('fighter', 1, { con: 10 });
      repos.charState.findOne!.mockResolvedValue(
        makeCharacterState({ current_hp: 15, max_hp_bonus: 5 }),
      );
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.maxHp).toBe(15); // 10 + 5 bonus
    });
  });

  describe('Armor Class', () => {
    it('no armor: 10 + DEX mod', async () => {
      setupBasicSheet('fighter', 1, { dex: 14 });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.armorClass).toBe(12); // 10 + 2
    });

    it('light armor (AC base 11): 11 + DEX mod', async () => {
      setupBasicSheet('fighter', 1, { dex: 14 }, () => {
        repos.charEquip.find!.mockResolvedValue([
          makeCharacterEquipment('leather-armor', {
            equipped: true,
            equipmentOverrides: {
              armor_class: { base: 11, dex_bonus: true },
              weight: '10',
            },
          }),
        ]);
      });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.armorClass).toBe(13); // 11 + 2
    });

    it('medium armor (AC base 13): 13 + min(DEX mod, 2)', async () => {
      setupBasicSheet('fighter', 1, { dex: 18 }, () => {
        repos.charEquip.find!.mockResolvedValue([
          makeCharacterEquipment('chain-shirt', {
            equipped: true,
            equipmentOverrides: {
              armor_class: { base: 13, dex_bonus: true, max_bonus: 2 },
              weight: '20',
            },
          }),
        ]);
      });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.armorClass).toBe(15); // 13 + min(4, 2) = 15
    });

    it('heavy armor (AC base 16): ignores DEX', async () => {
      setupBasicSheet('fighter', 1, { dex: 18 }, () => {
        repos.charEquip.find!.mockResolvedValue([
          makeCharacterEquipment('chain-mail', {
            equipped: true,
            equipmentOverrides: {
              armor_class: { base: 16, dex_bonus: false },
              weight: '55',
            },
          }),
        ]);
      });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.armorClass).toBe(16);
    });

    it('shield adds +2 to AC', async () => {
      setupBasicSheet('fighter', 1, { dex: 14 }, () => {
        repos.charEquip.find!.mockResolvedValue([
          makeCharacterEquipment('shield', {
            equipped: true,
            equipmentOverrides: {
              armor_class: { base: 0 },
              weight: '6',
            },
          }),
        ]);
      });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.armorClass).toBe(14); // 10 + 2(dex) + 2(shield)
    });
  });

  describe('Spell slots', () => {
    it('wizard level 5 (full caster): [4,3,2]', async () => {
      setupBasicSheet('wizard', 5, { int: 16 });
      const sheet = await service.computeSheet('user-1', 'char-1');
      const slotLevels = sheet.spellSlots.map((s) => s.total);
      expect(slotLevels).toEqual([4, 3, 2]);
    });

    it('paladin level 5 (half caster, effective 2): [3]', async () => {
      setupBasicSheet('paladin', 5, { cha: 16 });
      const sheet = await service.computeSheet('user-1', 'char-1');
      const slotLevels = sheet.spellSlots.map((s) => s.total);
      expect(slotLevels).toEqual([3]); // effective caster level = floor(5/2) = 2 -> FULL_CASTER_SLOTS[2] = [3]
    });

    it('warlock level 5: pact slot {level: 3, slots: 2}', async () => {
      setupBasicSheet('warlock', 5, { cha: 16 });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.spellSlots).toHaveLength(1);
      expect(sheet.spellSlots[0].level).toBe(3);
      expect(sheet.spellSlots[0].total).toBe(2);
    });

    it('fighter level 5 (non-caster): no spell slots', async () => {
      setupBasicSheet('fighter', 5);
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.spellSlots).toEqual([]);
    });
  });

  describe('Skills', () => {
    it('proficient skill: base mod + proficiency bonus', async () => {
      setupBasicSheet('fighter', 1, { dex: 14 }, () => {
        repos.charSkill.find!.mockResolvedValue([
          makeCharacterSkill('stealth', 'dex', false),
        ]);
      });
      const sheet = await service.computeSheet('user-1', 'char-1');
      const stealth = sheet.skills.find((s) => s.slug === 'stealth');
      expect(stealth?.bonus).toBe(4); // dexMod(2) + prof(2)
    });

    it('expertise skill: base mod + 2x proficiency bonus', async () => {
      setupBasicSheet('rogue', 1, { dex: 16 }, () => {
        repos.charSkill.find!.mockResolvedValue([
          makeCharacterSkill('stealth', 'dex', true),
        ]);
      });
      const sheet = await service.computeSheet('user-1', 'char-1');
      const stealth = sheet.skills.find((s) => s.slug === 'stealth');
      expect(stealth?.bonus).toBe(7); // dexMod(3) + prof(2) + expertise(2)
    });
  });

  describe('Passive Perception', () => {
    it('non-proficient: 10 + WIS mod', async () => {
      setupBasicSheet('fighter', 1, { wis: 14 });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.passivePerception).toBe(12); // 10 + 2
    });

    it('proficient: 10 + WIS mod + proficiency bonus', async () => {
      setupBasicSheet('fighter', 1, { wis: 14 }, () => {
        repos.charSkill.find!.mockResolvedValue([
          makeCharacterSkill('perception', 'wis', false),
        ]);
      });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.passivePerception).toBe(14); // 10 + 2 + 2
    });
  });

  describe('Carrying capacity', () => {
    it('STR 10: capacity = 150', async () => {
      setupBasicSheet('fighter', 1, { str: 10 });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.carryingCapacity).toBe(150);
    });

    it('STR 16: capacity = 240', async () => {
      setupBasicSheet('fighter', 1, { str: 16 });
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.carryingCapacity).toBe(240);
    });
  });

  describe('XP level-up detection', () => {
    it('should show canLevelUp=true when xp >= threshold', async () => {
      setupBasicSheet('fighter', 1);
      repos.charState.findOne!.mockResolvedValue(
        makeCharacterState({ xp: 300 }),
      );
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.levelUpAvailable).toBe(true);
    });

    it('should show canLevelUp=false when xp < threshold', async () => {
      setupBasicSheet('fighter', 1);
      repos.charState.findOne!.mockResolvedValue(
        makeCharacterState({ xp: 100 }),
      );
      const sheet = await service.computeSheet('user-1', 'char-1');
      expect(sheet.levelUpAvailable).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should throw NotFoundException if character not found', async () => {
      repos.character.findOne!.mockResolvedValue(null);
      await expect(
        service.computeSheet('user-1', 'char-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
