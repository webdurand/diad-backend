import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LevelUpService } from 'src/models/characters/services/level-up.service';
import {
  createMockRepository,
  createMockDataSource,
} from 'src/shared/test-utils/mock-repositories';
import {
  makeCharacter,
  makeCharacterClass,
  makeCharacterAbilityScores,
  makeCharacterState,
  makeCharacterSpell,
  makeClass,
  resetIdCounter,
} from 'src/shared/test-utils/entity-factories';
import { XP_THRESHOLDS, CASTER_CLASS_TYPE } from 'src/shared/srd-constants';
import { SpellStatusEnum } from 'src/entities/enums';

describe('LevelUpService', () => {
  let service: LevelUpService;
  let repos: Record<string, ReturnType<typeof createMockRepository>>;
  let dataSource: ReturnType<typeof createMockDataSource>;
  let mockManager: Record<string, jest.Mock>;

  beforeEach(() => {
    resetIdCounter();
    repos = {
      character: createMockRepository(),
      charClass: createMockRepository(),
      charAbility: createMockRepository(),
      state: createMockRepository(),
      levelUp: createMockRepository(),
      charFeature: createMockRepository(),
      charSpell: createMockRepository(),
      charProf: createMockRepository(),
      class: createMockRepository(),
      level: createMockRepository(),
      subclass: createMockRepository(),
      spell: createMockRepository(),
      proficiency: createMockRepository(),
      spellClass: createMockRepository(),
    };

    mockManager = {
      save: jest.fn(async (_: any, data: any) => ({ id: 'auto-id', ...data })),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
    };

    dataSource = createMockDataSource();
    dataSource.transaction!.mockImplementation(async (cb: any) => cb(mockManager));

    service = new LevelUpService(
      dataSource as any,
      repos.character as any,
      repos.charClass as any,
      repos.charAbility as any,
      repos.state as any,
      repos.levelUp as any,
      repos.charFeature as any,
      repos.charSpell as any,
      repos.charProf as any,
      repos.class as any,
      repos.level as any,
      repos.subclass as any,
      repos.spell as any,
      repos.proficiency as any,
      repos.spellClass as any,
    );
  });

  const setupForExecute = (opts: {
    classSlug?: string;
    totalLevel?: number;
    xp?: number;
    con?: number;
  } = {}) => {
    const classSlug = opts.classSlug ?? 'fighter';
    const totalLevel = opts.totalLevel ?? 1;
    const xp = opts.xp ?? XP_THRESHOLDS[totalLevel];
    const con = opts.con ?? 10;

    const cc = makeCharacterClass(classSlug, totalLevel);
    const abilities = makeCharacterAbilityScores({ con });
    const state = makeCharacterState({ xp, current_hp: 10 });
    const classEntity = makeClass(classSlug);

    repos.character.findOne!.mockResolvedValue(makeCharacter());
    repos.state.findOne!.mockResolvedValue(state);
    repos.charClass.find!.mockResolvedValue([cc]);
    repos.charAbility.find!.mockResolvedValue(abilities);
    repos.class.findOneBy!.mockResolvedValue(classEntity);
    repos.level.findOne!.mockResolvedValue(null);

    return { cc, abilities, state, classEntity };
  };

  describe('getOptions', () => {
    it('should show canLevelUp=true when XP meets threshold', async () => {
      const cc = makeCharacterClass('fighter', 1);
      const state = makeCharacterState({ xp: 300 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([cc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([cc.class]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions('user-1', 'char-1');
      expect(result.canLevelUp).toBe(true);
      expect(result.currentLevel).toBe(1);
      expect(result.newLevel).toBe(2);
    });

    it('should show canLevelUp=false when XP is below threshold', async () => {
      const cc = makeCharacterClass('fighter', 1);
      const state = makeCharacterState({ xp: 100 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([cc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([cc.class]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions('user-1', 'char-1');
      expect(result.canLevelUp).toBe(false);
    });

    it('should not allow level-up at level 20', async () => {
      const cc = makeCharacterClass('fighter', 20);
      const state = makeCharacterState({ xp: 999999 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([cc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([cc.class]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions('user-1', 'char-1');
      expect(result.canLevelUp).toBe(false);
    });

    it('should throw NotFoundException if character not found', async () => {
      repos.character.findOne!.mockResolvedValue(null);
      await expect(service.getOptions('user-1', 'no-char')).rejects.toThrow(NotFoundException);
    });
  });

  describe('execute', () => {
    it('should reject if level is already 20', async () => {
      setupForExecute({ totalLevel: 20, xp: 999999 });
      repos.charClass.find!.mockResolvedValue([makeCharacterClass('fighter', 20)]);

      await expect(
        service.execute('user-1', 'char-1', {
          classSlug: 'fighter',
          hpMethod: 'fixed',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if XP is insufficient', async () => {
      setupForExecute({ totalLevel: 1, xp: 100 }); // need 300 for level 2

      await expect(
        service.execute('user-1', 'char-1', {
          classSlug: 'fighter',
          hpMethod: 'fixed',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should calculate fixed HP as hitDie/2 + 1 + conMod', async () => {
      // Fighter hit_die=10: fixed = 10/2+1 = 6, con 14 -> mod 2, total = 8
      setupForExecute({ totalLevel: 1, xp: 300, con: 14 });

      const result = await service.execute('user-1', 'char-1', {
        classSlug: 'fighter',
        hpMethod: 'fixed',
      });

      expect(result.hpGained).toBe(8); // 6 + 2
      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(2);
    });

    it('should calculate rolled HP correctly', async () => {
      setupForExecute({ totalLevel: 1, xp: 300, con: 10 });

      const result = await service.execute('user-1', 'char-1', {
        classSlug: 'fighter',
        hpMethod: 'roll',
        hpRoll: 7,
      });

      expect(result.hpGained).toBe(7); // 7 + 0 conMod
    });

    it('should enforce minimum 1 HP gained', async () => {
      // Wizard hit_die=6, con 6 -> mod -2, fixed = 4-2 = 2 (still > 1)
      // But with roll of 1: 1 + (-2) = -1 -> min 1
      setupForExecute({ classSlug: 'wizard', totalLevel: 1, xp: 300, con: 6 });
      repos.class.findOneBy!.mockResolvedValue(makeClass('wizard'));

      const result = await service.execute('user-1', 'char-1', {
        classSlug: 'wizard',
        hpMethod: 'roll',
        hpRoll: 1,
      });

      expect(result.hpGained).toBe(1);
    });

    it('should reject invalid HP roll (> hit die)', async () => {
      setupForExecute({ totalLevel: 1, xp: 300 });

      await expect(
        service.execute('user-1', 'char-1', {
          classSlug: 'fighter',
          hpMethod: 'roll',
          hpRoll: 11, // fighter hit_die = 10
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject roll method without hpRoll', async () => {
      setupForExecute({ totalLevel: 1, xp: 300 });

      await expect(
        service.execute('user-1', 'char-1', {
          classSlug: 'fighter',
          hpMethod: 'roll',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle CON ASI with retroactive HP adjustment', async () => {
      // Level up from 1 -> 2, then apply +2 CON
      // CON 14 -> mod 2, after ASI CON 16 -> mod 3, diff = 1
      // Retroactive: diff * totalLevel = 1 * 2 = 2 extra HP
      setupForExecute({ totalLevel: 1, xp: 300, con: 14 });

      const result = await service.execute('user-1', 'char-1', {
        classSlug: 'fighter',
        hpMethod: 'fixed',
        abilityScoreIncreases: [{ abilitySlug: 'con', increase: 2 }],
      });

      expect(result.hpGained).toBe(8); // 6 + 2 conMod
      // The retroactive adjustment happens via state.current_hp += retroHp
      // We can verify the manager.save was called with adjusted HP
      const stateSaves = mockManager.save.mock.calls.filter(
        (call: any[]) => {
          const entity = call[0];
          return typeof entity === 'function' && entity.name === 'CharacterStateEntity';
        },
      );
      expect(stateSaves.length).toBeGreaterThanOrEqual(1);
    });

    it('should add new spells during level-up', async () => {
      setupForExecute({ classSlug: 'wizard', totalLevel: 1, xp: 300 });
      repos.class.findOneBy!.mockResolvedValue(makeClass('wizard'));

      const spellEntity = { id: 'spell-mm', slug: 'magic-missile', level: 1 };
      repos.spell.findOneBy!.mockResolvedValue(spellEntity);
      mockManager.findOne!.mockResolvedValue(null); // No existing spell
      mockManager.findOneBy!.mockResolvedValue(null);

      await service.execute('user-1', 'char-1', {
        classSlug: 'wizard',
        hpMethod: 'fixed',
        newSpells: ['magic-missile'],
      });

      // Verify spell was saved with Spellbook status (wizard = spellbook caster)
      const spellSaves = mockManager.save.mock.calls.filter(
        (call: any[]) => {
          const data = call[1];
          return data?.spell_id === 'spell-mm';
        },
      );
      expect(spellSaves).toHaveLength(1);
      expect(spellSaves[0][1].status).toBe(SpellStatusEnum.Spellbook);
    });

    it('should use Known status for known-caster classes', async () => {
      const bardClass = makeClass('bard');
      setupForExecute({ classSlug: 'bard', totalLevel: 1, xp: 300 });
      repos.class.findOneBy!.mockResolvedValue(bardClass);

      const spellEntity = { id: 'spell-hf', slug: 'healing-word', level: 1 };
      repos.spell.findOneBy!.mockResolvedValue(spellEntity);
      mockManager.findOne!.mockResolvedValue(null);
      mockManager.findOneBy!.mockResolvedValue(null);

      await service.execute('user-1', 'char-1', {
        classSlug: 'bard',
        hpMethod: 'fixed',
        newSpells: ['healing-word'],
      });

      const spellSaves = mockManager.save.mock.calls.filter(
        (call: any[]) => call[1]?.spell_id === 'spell-hf',
      );
      expect(spellSaves).toHaveLength(1);
      expect(spellSaves[0][1].status).toBe(SpellStatusEnum.Known);
    });

    it('should throw NotFoundException for missing character', async () => {
      repos.character.findOne!.mockResolvedValue(null);

      await expect(
        service.execute('user-1', 'no-char', {
          classSlug: 'fighter',
          hpMethod: 'fixed',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---- Spec 005: PHB slug normalization ----
  // Bug: PC criado com classSlug 'fighter-phb' (source PHB) recebendo POST
  // /level-up { classSlug: 'fighter' } virava multiclass em vez de avançar.
  // Causa: comparação exata `cc.class.slug === dto.classSlug` (line 369).
  describe('Spec 005: PHB slug normalization', () => {
    const setupForPhbExecute = (opts: {
      classSlug: string;
      ccSlug: string;
      totalLevel?: number;
      xp?: number;
      con?: number;
    }) => {
      const totalLevel = opts.totalLevel ?? 1;
      const xp = opts.xp ?? XP_THRESHOLDS[totalLevel];
      const con = opts.con ?? 10;

      const cc = makeCharacterClass(opts.ccSlug, totalLevel);
      const abilities = makeCharacterAbilityScores({ con });
      const state = makeCharacterState({ xp, current_hp: 10 });
      const classEntity = makeClass(opts.ccSlug);

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([cc]);
      repos.charAbility.find!.mockResolvedValue(abilities);
      // classRepo should resolve the char's own class when input is 'fighter'
      // but cc uses 'fighter-phb'. The service must resolve to cc.class.
      repos.class.findOneBy!.mockImplementation(async (where: { slug: string }) => {
        if (where.slug === opts.ccSlug) return classEntity;
        if (where.slug === opts.classSlug) return classEntity;
        return null;
      });
      repos.level.findOne!.mockResolvedValue(null);

      return { cc, classEntity };
    };

    it('PC fighter-phb + classSlug "fighter" → advances L2 (NOT multiclass)', async () => {
      setupForPhbExecute({ ccSlug: 'fighter-phb', classSlug: 'fighter' });

      const result = await service.execute('user-1', 'char-1', {
        classSlug: 'fighter',
        hpMethod: 'fixed',
      });

      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(2);
      // critical: classLevel reflects advance, not a new multiclass level 1
    });

    it('PC fighter-phb + classSlug "fighter-phb" → advances L2 (idempotent)', async () => {
      setupForPhbExecute({ ccSlug: 'fighter-phb', classSlug: 'fighter-phb' });

      const result = await service.execute('user-1', 'char-1', {
        classSlug: 'fighter-phb',
        hpMethod: 'fixed',
      });

      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(2);
    });

    it('PC fighter-phb + classSlug "FIGHTER" (uppercase) → advances L2', async () => {
      setupForPhbExecute({ ccSlug: 'fighter-phb', classSlug: 'FIGHTER' });

      const result = await service.execute('user-1', 'char-1', {
        classSlug: 'FIGHTER',
        hpMethod: 'fixed',
      });

      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(2);
    });

    it('PC fighter (XPHB) + classSlug "fighter-phb" → advances as Fighter (canonical match)', async () => {
      setupForPhbExecute({ ccSlug: 'fighter', classSlug: 'fighter-phb' });

      const result = await service.execute('user-1', 'char-1', {
        classSlug: 'fighter-phb',
        hpMethod: 'fixed',
      });

      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(2);
    });

    it('GET /level-up-options: PC fighter-phb sees ONE Fighter entry with canonical slug + sourceQualifiedSlug=fighter-phb + isCurrentClass=true', async () => {
      const phbCc = makeCharacterClass('fighter-phb', 1);
      const phbFighter = phbCc.class;
      const xphbFighter = makeClass('fighter'); // same canonical, different source-qualified
      const state = makeCharacterState({ xp: 300 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([phbCc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      // DB has BOTH fighter-phb and fighter (different source rows)
      repos.class.find!.mockResolvedValue([phbFighter, xphbFighter]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions('user-1', 'char-1');

      const fighterEntries = result.availableClasses.filter(
        (c) => c.slug === 'fighter' || c.slug === 'fighter-phb',
      );
      expect(fighterEntries).toHaveLength(1);
      const entry = fighterEntries[0];
      expect(entry.slug).toBe('fighter'); // canonical, no suffix
      expect(entry.sourceQualifiedSlug).toBe('fighter-phb');
      expect(entry.isCurrentClass).toBe(true);
      expect(entry.isMulticlass).toBe(false);
      expect(entry.nextLevel).toBe(2);
    });

    it('GET /level-up-options: PC fighter (XPHB) sees Fighter entry with sourceQualifiedSlug=fighter + isCurrentClass=true', async () => {
      const xphbCc = makeCharacterClass('fighter', 1);
      const phbFighter = makeClass('fighter-phb');
      const state = makeCharacterState({ xp: 300 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([xphbCc]);
      repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([xphbCc.class, phbFighter]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions('user-1', 'char-1');
      const entry = result.availableClasses.find((c) => c.slug === 'fighter');
      expect(entry).toBeDefined();
      expect(entry!.sourceQualifiedSlug).toBe('fighter');
      expect(entry!.isCurrentClass).toBe(true);
    });

    it('GET /level-up-options: Fighter PHB + Wizard in DB → Wizard entry is isCurrentClass=false, isMulticlass=true, nextLevel=1', async () => {
      const fighterPhbCc = makeCharacterClass('fighter-phb', 1);
      const wizardEntity = makeClass('wizard');
      const state = makeCharacterState({ xp: 300 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([fighterPhbCc]);
      repos.charAbility.find!.mockResolvedValue(
        makeCharacterAbilityScores({ str: 13, int: 13 }),
      );
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([fighterPhbCc.class, wizardEntity]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions('user-1', 'char-1');
      const wiz = result.availableClasses.find((c) => c.slug === 'wizard');
      expect(wiz).toBeDefined();
      expect(wiz!.isCurrentClass).toBe(false);
      expect(wiz!.isMulticlass).toBe(true);
      expect(wiz!.nextLevel).toBe(1);
    });

    it('GET /level-up-options: missingPrerequisites populated when ability insufficient', async () => {
      const fighterCc = makeCharacterClass('fighter', 1);
      const bardEntity = makeClass('bard', {
        multi_classing: {
          prerequisites: [
            { ability_score: { index: 'cha' }, minimum_score: 13 },
          ],
        },
      });
      const state = makeCharacterState({ xp: 300 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([fighterCc]);
      // Fighter STR 13 (multiclass prereq), CHA 8 (below bard requirement)
      repos.charAbility.find!.mockResolvedValue(
        makeCharacterAbilityScores({ str: 13, cha: 8 }),
      );
      repos.charSpell.find!.mockResolvedValue([]);
      repos.class.find!.mockResolvedValue([fighterCc.class, bardEntity]);
      repos.level.findOne!.mockResolvedValue(null);
      repos.subclass.find!.mockResolvedValue([]);
      repos.spellClass.find!.mockResolvedValue([]);

      const result = await service.getOptions('user-1', 'char-1');
      const bard = result.availableClasses.find((c) => c.slug === 'bard');
      expect(bard).toBeDefined();
      expect(bard!.meetsPrerequisites).toBe(false);
      expect(bard!.missingPrerequisites).toEqual([
        { ability: 'cha', required: 13, current: 8 },
      ]);
    });

    it('PC fighter-phb + classSlug "wizard" → multiclass (different canonical root)', async () => {
      const fighterPhbCc = makeCharacterClass('fighter-phb', 1);
      const wizardEntity = makeClass('wizard');
      const abilities = makeCharacterAbilityScores({ int: 13 }); // passes wizard INT 13
      const state = makeCharacterState({ xp: XP_THRESHOLDS[1], current_hp: 10 });

      repos.character.findOne!.mockResolvedValue(makeCharacter());
      repos.state.findOne!.mockResolvedValue(state);
      repos.charClass.find!.mockResolvedValue([fighterPhbCc]);
      repos.charAbility.find!.mockResolvedValue(abilities);
      repos.class.findOneBy!.mockImplementation(async (where: { slug: string }) => {
        if (where.slug === 'fighter-phb') return fighterPhbCc.class;
        if (where.slug === 'wizard') return wizardEntity;
        return null;
      });
      repos.level.findOne!.mockResolvedValue(null);

      const result = await service.execute('user-1', 'char-1', {
        classSlug: 'wizard',
        hpMethod: 'fixed',
      });

      expect(result.totalLevel).toBe(2);
      expect(result.classLevel).toBe(1); // new class, level 1
      expect(result.className).toBe('Wizard');
    });
  });
});
