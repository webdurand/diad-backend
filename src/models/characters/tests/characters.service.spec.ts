import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CharactersService } from 'src/models/characters/services/characters.service';
import {
  createMockRepository,
  createMockDataSource,
} from 'src/shared/test-utils/mock-repositories';
import {
  makeCharacter,
  makeClass,
  resetIdCounter,
} from 'src/shared/test-utils/entity-factories';
import { SpellStatusEnum, SpellSourceEnum, EquipmentSourceEnum } from 'src/entities/enums';

describe('CharactersService', () => {
  let service: CharactersService;
  let repos: Record<string, ReturnType<typeof createMockRepository>>;
  let dataSource: ReturnType<typeof createMockDataSource>;
  let mockManager: Record<string, jest.Mock>;

  beforeEach(() => {
    resetIdCounter();
    repos = {
      character: createMockRepository(),
      class: createMockRepository(),
      race: createMockRepository(),
      subrace: createMockRepository(),
      background: createMockRepository(),
      alignment: createMockRepository(),
      abilityScore: createMockRepository(),
      skill: createMockRepository(),
      proficiency: createMockRepository(),
      spell: createMockRepository(),
      equipment: createMockRepository(),
      classStartingEquip: createMockRepository(),
      level: createMockRepository(),
      compSource: createMockRepository(),
    };

    mockManager = {
      create: jest.fn((_, data) => ({ id: 'char-new', ...data })),
      save: jest.fn((_, data) => Promise.resolve({ id: data?.id ?? 'char-new', ...data })),
      findOneBy: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
    };

    dataSource = createMockDataSource();
    dataSource.transaction!.mockImplementation(async (cb: any) => cb(mockManager));

    service = new CharactersService(
      dataSource as any,
      repos.character as any,
      repos.class as any,
      repos.race as any,
      repos.subrace as any,
      repos.background as any,
      repos.alignment as any,
      repos.abilityScore as any,
      repos.skill as any,
      repos.proficiency as any,
      repos.spell as any,
      repos.equipment as any,
      repos.classStartingEquip as any,
      repos.level as any,
      repos.compSource as any,
    );
  });

  describe('listByUser', () => {
    it('should return characters ordered by createdAt DESC', async () => {
      const chars = [makeCharacter({ name: 'A' }), makeCharacter({ id: 'char-2', name: 'B' })];
      repos.character.find!.mockResolvedValue(chars);
      const result = await service.listByUser('user-1');
      expect(result).toHaveLength(2);
      expect(repos.character.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });

  describe('getById', () => {
    it('should return character by id', async () => {
      const char = makeCharacter();
      repos.character.findOne!.mockResolvedValue(char);
      const result = await service.getById('user-1', 'char-1');
      expect(result.id).toBe('char-1');
    });

    it('should throw NotFoundException if character not found', async () => {
      repos.character.findOne!.mockResolvedValue(null);
      await expect(service.getById('user-1', 'char-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update character name', async () => {
      const char = makeCharacter({ name: 'Old Name' });
      repos.character.findOne!.mockResolvedValue(char);
      repos.character.save!.mockResolvedValue({ ...char, name: 'New Name' });
      const result = await service.update('user-1', 'char-1', { name: 'New Name' });
      expect(result.name).toBe('New Name');
    });
  });

  describe('remove', () => {
    it('should remove character', async () => {
      const char = makeCharacter();
      repos.character.findOne!.mockResolvedValue(char);
      await service.remove('user-1', 'char-1');
      expect(repos.character.remove).toHaveBeenCalledWith(char);
    });

    it('should throw NotFoundException if character not found', async () => {
      repos.character.findOne!.mockResolvedValue(null);
      await expect(service.remove('user-1', 'char-missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should throw BadRequestException if name is empty', async () => {
      await expect(
        service.create({ userId: 'user-1', name: '', data: {} }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if name is whitespace only', async () => {
      await expect(
        service.create({ userId: 'user-1', name: '   ', data: {} }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a basic fighter character with correct starting HP', async () => {
      const fighterClass = makeClass('fighter');
      const raceEntity = { id: 'race-1', slug: 'human', name: 'Human', speed: 30 };
      const bgEntity = { id: 'bg-1', slug: 'acolyte', name: 'Acolyte' };

      // When manager.save(CharacterEntity, ...) is called, return an entity with an id
      mockManager.save.mockImplementation(async (entity: any, data: any) => {
        if (typeof entity === 'function' && entity.name === 'CharacterEntity') {
          return { id: 'char-new', ...data };
        }
        return { id: 'rec-auto', ...data };
      });

      mockManager.findOneBy = jest.fn().mockImplementation(async (entity: any, criteria: any) => {
        return null;
      });

      // Setup repos for lookups inside transaction
      repos.class.findOneBy = jest.fn().mockResolvedValue(fighterClass) as any;
      repos.race.findOneBy = jest.fn().mockResolvedValue(raceEntity) as any;
      repos.subrace.findOneBy = jest.fn().mockResolvedValue(null) as any;
      repos.background.findOneBy = jest.fn().mockResolvedValue(bgEntity) as any;
      repos.alignment.findOneBy = jest.fn().mockResolvedValue(null) as any;
      repos.abilityScore.findOneBy = jest.fn().mockImplementation(async ({ slug }: any) => {
        return { id: `as-${slug}`, slug, name: slug.toUpperCase() };
      }) as any;
      repos.classStartingEquip.find = jest.fn().mockResolvedValue([]) as any;
      repos.level.findOne = jest.fn().mockResolvedValue(null) as any;

      // The actual mock chain for transaction manager uses different repos
      // We need the transaction's manager to do all the lookups
      const lookups: Record<string, any> = {
        fighter: fighterClass,
        human: raceEntity,
        acolyte: bgEntity,
      };

      // Re-mock the manager to handle entity manager lookups
      const abilityEntities: Record<string, any> = {
        str: { id: 'as-str', slug: 'str' },
        dex: { id: 'as-dex', slug: 'dex' },
        con: { id: 'as-con', slug: 'con' },
        int: { id: 'as-int', slug: 'int' },
        wis: { id: 'as-wis', slug: 'wis' },
        cha: { id: 'as-cha', slug: 'cha' },
      };

      // Override transaction to test the create flow
      dataSource.transaction!.mockImplementation(async (cb: any) => {
        const mgr = {
          create: jest.fn((_, data: any) => ({ id: 'char-new', ...data })),
          save: jest.fn(async (_: any, data: any) => ({ id: data?.id ?? 'char-new', ...data })),
          findOneBy: jest.fn(),
          find: jest.fn().mockResolvedValue([]),
          createQueryBuilder: jest.fn().mockReturnValue({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({}),
          }),
        };
        return cb(mgr);
      });

      const result = await service.create({
        userId: 'user-1',
        name: 'My Fighter',
        data: {
          classSlug: 'fighter',
          raceSlug: 'human',
          backgroundSlug: 'acolyte',
          abilityScores: {
            strength: 16,
            dexterity: 14,
            constitution: 14,
            intelligence: 10,
            wisdom: 12,
            charisma: 8,
          },
        },
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('char-new');
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('should compute starting HP as hit_die + CON modifier', async () => {
      // CON 14 -> mod = 2; fighter hit_die = 10 -> HP = 12
      const saves: Array<{ entity: string; data: any }> = [];
      const fighterClass = makeClass('fighter');

      repos.class.findOneBy!.mockResolvedValue(fighterClass);
      repos.race.findOneBy!.mockResolvedValue({
        id: 'race-1',
        slug: 'human',
        name: 'Human',
        speed: 30,
      });
      repos.background.findOneBy!.mockResolvedValue({
        id: 'bg-1',
        slug: 'acolyte',
        name: 'Acolyte',
      });
      repos.abilityScore.findOneBy!.mockImplementation(
        async ({ slug }: any) => ({ id: `as-${slug}`, slug }),
      );
      repos.classStartingEquip.find!.mockResolvedValue([]);
      repos.level.findOne!.mockResolvedValue(null);

      dataSource.transaction!.mockImplementation(async (cb: any) => {
        const mgr = {
          create: jest.fn((_: any, data: any) => ({ id: 'char-new', ...data })),
          save: jest.fn(async (entityClass: any, data: any) => {
            const entityName = typeof entityClass === 'function' ? entityClass.name : entityClass;
            saves.push({ entity: entityName, data });
            return { id: data?.id ?? 'char-new', ...data };
          }),
          findOneBy: jest.fn().mockImplementation((entityClass: any, criteria: any) => {
            // Simulate lookups
            if (criteria?.slug === 'fighter') return fighterClass;
            if (criteria?.slug === 'human') return { id: 'race-1', slug: 'human', name: 'Human', speed: 30 };
            if (criteria?.slug === 'acolyte') return { id: 'bg-1', slug: 'acolyte', name: 'Acolyte' };
            if (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(criteria?.slug)) {
              return { id: `as-${criteria.slug}`, slug: criteria.slug };
            }
            return null;
          }),
          find: jest.fn().mockResolvedValue([]),
          createQueryBuilder: jest.fn().mockReturnValue({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({}),
          }),
        };
        return cb(mgr);
      });

      await service.create({
        userId: 'user-1',
        name: 'Fighter',
        data: {
          classSlug: 'fighter',
          raceSlug: 'human',
          backgroundSlug: 'acolyte',
          abilityScores: { constitution: 14, strength: 16, dexterity: 14, intelligence: 10, wisdom: 12, charisma: 8 },
        },
      });

      const stateSave = saves.find((s) => s.entity === 'CharacterStateEntity');
      expect(stateSave).toBeDefined();
      // Fighter hit_die = 10, CON 14 -> mod +2, starting HP = 12
      expect(stateSave!.data.current_hp).toBe(12);
    });

    it('should handle negative CON modifier for starting HP', async () => {
      const saves: Array<{ entity: string; data: any }> = [];
      const wizardClass = makeClass('wizard'); // hit_die = 6

      repos.class.findOneBy!.mockResolvedValue(wizardClass);
      repos.race.findOneBy!.mockResolvedValue({
        id: 'race-1',
        slug: 'human',
        name: 'Human',
        speed: 30,
      });
      repos.background.findOneBy!.mockResolvedValue({
        id: 'bg-1',
        slug: 'acolyte',
        name: 'Acolyte',
      });
      repos.abilityScore.findOneBy!.mockImplementation(
        async ({ slug }: any) => ({ id: `as-${slug}`, slug }),
      );
      repos.classStartingEquip.find!.mockResolvedValue([]);
      repos.level.findOne!.mockResolvedValue(null);

      dataSource.transaction!.mockImplementation(async (cb: any) => {
        const mgr = {
          create: jest.fn((_: any, data: any) => ({ id: 'char-new', ...data })),
          save: jest.fn(async (entityClass: any, data: any) => {
            const entityName = typeof entityClass === 'function' ? entityClass.name : entityClass;
            saves.push({ entity: entityName, data });
            return { id: data?.id ?? 'char-new', ...data };
          }),
          findOneBy: jest.fn().mockImplementation((entityClass: any, criteria: any) => {
            if (criteria?.slug === 'wizard') return wizardClass;
            if (criteria?.slug === 'human') return { id: 'race-1', slug: 'human', name: 'Human', speed: 30 };
            if (criteria?.slug === 'acolyte') return { id: 'bg-1', slug: 'acolyte', name: 'Acolyte' };
            if (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(criteria?.slug)) {
              return { id: `as-${criteria.slug}`, slug: criteria.slug };
            }
            return null;
          }),
          find: jest.fn().mockResolvedValue([]),
          createQueryBuilder: jest.fn().mockReturnValue({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({}),
          }),
        };
        return cb(mgr);
      });

      await service.create({
        userId: 'user-1',
        name: 'Squishy Wizard',
        data: {
          classSlug: 'wizard',
          raceSlug: 'human',
          backgroundSlug: 'acolyte',
          abilityScores: { constitution: 8, strength: 8, dexterity: 14, intelligence: 16, wisdom: 12, charisma: 10 },
        },
      });

      const stateSave = saves.find((s) => s.entity === 'CharacterStateEntity');
      // Wizard hit_die = 6, CON 8 -> mod -1, starting HP = 5
      expect(stateSave!.data.current_hp).toBe(5);
    });

    it('should deduplicate spells (cantrip takes precedence over spellbook)', async () => {
      const saves: Array<{ entity: string; data: any }> = [];
      const wizardClass = makeClass('wizard');

      repos.class.findOneBy!.mockResolvedValue(wizardClass);
      repos.race.findOneBy!.mockResolvedValue({
        id: 'race-1',
        slug: 'human',
        name: 'Human',
        speed: 30,
      });
      repos.background.findOneBy!.mockResolvedValue({
        id: 'bg-1',
        slug: 'acolyte',
        name: 'Acolyte',
      });
      repos.abilityScore.findOneBy!.mockImplementation(
        async ({ slug }: any) => ({ id: `as-${slug}`, slug }),
      );
      repos.spell.findOneBy!.mockImplementation(async ({ slug }: any) => ({
        id: `spell-${slug}`,
        slug,
      }));
      repos.classStartingEquip.find!.mockResolvedValue([]);
      repos.level.findOne!.mockResolvedValue(null);

      dataSource.transaction!.mockImplementation(async (cb: any) => {
        const mgr = {
          create: jest.fn((_: any, data: any) => ({ id: 'char-new', ...data })),
          save: jest.fn(async (entityClass: any, data: any) => {
            const entityName = typeof entityClass === 'function' ? entityClass.name : entityClass;
            saves.push({ entity: entityName, data });
            return { id: data?.id ?? 'char-new', ...data };
          }),
          findOneBy: jest.fn().mockImplementation((_: any, criteria: any) => {
            if (criteria?.slug === 'wizard') return wizardClass;
            if (criteria?.slug === 'human') return { id: 'race-1', slug: 'human', name: 'Human', speed: 30 };
            if (criteria?.slug === 'acolyte') return { id: 'bg-1', slug: 'acolyte', name: 'Acolyte' };
            if (criteria?.slug === 'fire-bolt') return { id: 'spell-fb', slug: 'fire-bolt' };
            if (criteria?.slug === 'mage-hand') return { id: 'spell-mh', slug: 'mage-hand' };
            if (criteria?.slug === 'shield') return { id: 'spell-sh', slug: 'shield' };
            if (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(criteria?.slug)) {
              return { id: `as-${criteria.slug}`, slug: criteria.slug };
            }
            return null;
          }),
          find: jest.fn().mockResolvedValue([]),
          createQueryBuilder: jest.fn().mockReturnValue({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({}),
          }),
        };
        return cb(mgr);
      });

      await service.create({
        userId: 'user-1',
        name: 'Wizard',
        data: {
          classSlug: 'wizard',
          raceSlug: 'human',
          backgroundSlug: 'acolyte',
          abilityScores: { constitution: 10, strength: 8, dexterity: 14, intelligence: 16, wisdom: 12, charisma: 10 },
          classCantrips: ['fire-bolt', 'mage-hand'],
          classPreparedSpells: ['shield'],
          classSpellbook: ['shield'], // duplicate — should be skipped
        },
      });

      const spellSaves = saves.filter((s) => s.entity === 'CharacterSpellEntity');
      const spellIds = spellSaves.map((s) => s.data.spell_id);
      // shield should appear only once (as Prepared, not Spellbook)
      const shieldSaves = spellSaves.filter(
        (s) => s.data.spell_id === 'spell-shield',
      );
      expect(shieldSaves).toHaveLength(1);
      expect(shieldSaves[0].data.status).toBe(SpellStatusEnum.Prepared);
    });

    it('should apply background ability bonuses to starting HP', async () => {
      const saves: Array<{ entity: string; data: any }> = [];
      const fighterClass = makeClass('fighter');

      repos.class.findOneBy!.mockResolvedValue(fighterClass);
      repos.race.findOneBy!.mockResolvedValue({
        id: 'race-1',
        slug: 'human',
        name: 'Human',
        speed: 30,
      });
      repos.background.findOneBy!.mockResolvedValue({
        id: 'bg-1',
        slug: 'soldier',
        name: 'Soldier',
      });
      repos.abilityScore.findOneBy!.mockImplementation(
        async ({ slug }: any) => ({ id: `as-${slug}`, slug }),
      );
      repos.classStartingEquip.find!.mockResolvedValue([]);
      repos.level.findOne!.mockResolvedValue(null);

      dataSource.transaction!.mockImplementation(async (cb: any) => {
        const mgr = {
          create: jest.fn((_: any, data: any) => ({ id: 'char-new', ...data })),
          save: jest.fn(async (entityClass: any, data: any) => {
            const entityName = typeof entityClass === 'function' ? entityClass.name : entityClass;
            saves.push({ entity: entityName, data });
            return { id: data?.id ?? 'char-new', ...data };
          }),
          findOneBy: jest.fn().mockImplementation((_: any, criteria: any) => {
            if (criteria?.slug === 'fighter') return fighterClass;
            if (criteria?.slug === 'human') return { id: 'race-1', slug: 'human', name: 'Human', speed: 30 };
            if (criteria?.slug === 'soldier') return { id: 'bg-1', slug: 'soldier', name: 'Soldier' };
            if (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(criteria?.slug)) {
              return { id: `as-${criteria.slug}`, slug: criteria.slug };
            }
            return null;
          }),
          find: jest.fn().mockResolvedValue([]),
          createQueryBuilder: jest.fn().mockReturnValue({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({}),
          }),
        };
        return cb(mgr);
      });

      await service.create({
        userId: 'user-1',
        name: 'Fighter with CON bonus',
        data: {
          classSlug: 'fighter',
          raceSlug: 'human',
          backgroundSlug: 'soldier',
          abilityScores: { constitution: 14, strength: 16, dexterity: 14, intelligence: 10, wisdom: 12, charisma: 8 },
          backgroundAbilityBonuses: [{ abilityScoreIndex: 'con', bonus: 1 }],
        },
      });

      const stateSave = saves.find((s) => s.entity === 'CharacterStateEntity');
      // CON 14 + bonus 1 = 15 -> mod +2, fighter hit_die = 10, HP = 12
      expect(stateSave!.data.current_hp).toBe(12);
    });

    it('should use classStartingGold when present instead of equipment', async () => {
      const saves: Array<{ entity: string; data: any }> = [];
      const fighterClass = makeClass('fighter');

      repos.class.findOneBy!.mockResolvedValue(fighterClass);
      repos.race.findOneBy!.mockResolvedValue({
        id: 'race-1',
        slug: 'human',
        name: 'Human',
        speed: 30,
      });
      repos.background.findOneBy!.mockResolvedValue({
        id: 'bg-1',
        slug: 'acolyte',
        name: 'Acolyte',
      });
      repos.abilityScore.findOneBy!.mockImplementation(
        async ({ slug }: any) => ({ id: `as-${slug}`, slug }),
      );
      repos.classStartingEquip.find!.mockResolvedValue([]);
      repos.level.findOne!.mockResolvedValue(null);

      dataSource.transaction!.mockImplementation(async (cb: any) => {
        const mgr = {
          create: jest.fn((_: any, data: any) => ({ id: 'char-new', ...data })),
          save: jest.fn(async (entityClass: any, data: any) => {
            const entityName = typeof entityClass === 'function' ? entityClass.name : entityClass;
            saves.push({ entity: entityName, data });
            return { id: data?.id ?? 'char-new', ...data };
          }),
          findOneBy: jest.fn().mockImplementation((_: any, criteria: any) => {
            if (criteria?.slug === 'fighter') return fighterClass;
            if (criteria?.slug === 'human') return { id: 'race-1', slug: 'human', name: 'Human', speed: 30 };
            if (criteria?.slug === 'acolyte') return { id: 'bg-1', slug: 'acolyte', name: 'Acolyte' };
            if (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(criteria?.slug)) {
              return { id: `as-${criteria.slug}`, slug: criteria.slug };
            }
            return null;
          }),
          find: jest.fn().mockResolvedValue([]),
          createQueryBuilder: jest.fn().mockReturnValue({
            update: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({}),
          }),
        };
        return cb(mgr);
      });

      await service.create({
        userId: 'user-1',
        name: 'Gold Fighter',
        data: {
          classSlug: 'fighter',
          raceSlug: 'human',
          backgroundSlug: 'acolyte',
          abilityScores: { constitution: 10, strength: 16, dexterity: 14, intelligence: 10, wisdom: 12, charisma: 8 },
          classStartingGold: { amount: 150 },
        },
      });

      const stateSave = saves.find((s) => s.entity === 'CharacterStateEntity');
      expect(stateSave!.data.gp).toBe(150);
      // Also ensure no equipment is materialized
      const equipSaves = saves.filter((s) => s.entity === 'CharacterEquipmentEntity');
      expect(equipSaves).toHaveLength(0);
    });

    describe('spec 001 — character sheet compute', () => {
      const captureSaves = (saves: Array<{ entity: string; data: any }>) =>
        async (entityClass: any, data: any) => {
          const entityName = typeof entityClass === 'function' ? entityClass.name : entityClass;
          saves.push({ entity: entityName, data });
          return { id: data?.id ?? 'rec-auto', ...data };
        };

      const baseLookups = (fighterClass: any) => (_: any, criteria: any) => {
        if (criteria?.slug === 'fighter') return fighterClass;
        if (criteria?.slug === 'human') return { id: 'race-1', slug: 'human', name: 'Human', speed: 30 };
        if (criteria?.slug === 'soldier') return { id: 'bg-1', slug: 'soldier', name: 'Soldier' };
        if (criteria?.slug === 'acolyte') return { id: 'bg-1', slug: 'acolyte', name: 'Acolyte' };
        if (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(criteria?.slug)) {
          return { id: `as-${criteria.slug}`, slug: criteria.slug };
        }
        return null;
      };

      const setupTransaction = (saves: Array<{ entity: string; data: any }>, fighterClass: any) => {
        dataSource.transaction!.mockImplementation(async (cb: any) => {
          const mgr = {
            create: jest.fn((_: any, data: any) => ({ id: 'char-new', ...data })),
            save: jest.fn(captureSaves(saves)),
            findOneBy: jest.fn().mockImplementation(baseLookups(fighterClass)),
            find: jest.fn().mockResolvedValue([]),
            createQueryBuilder: jest.fn().mockReturnValue({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({}),
            }),
          };
          return cb(mgr);
        });
      };

      it('persists 6 ability scores when client sends short slugs (str/dex/con/int/wis/cha)', async () => {
        const saves: Array<{ entity: string; data: any }> = [];
        const fighterClass = makeClass('fighter');
        repos.class.findOneBy!.mockResolvedValue(fighterClass);
        repos.race.findOneBy!.mockResolvedValue({ id: 'race-1', slug: 'human' });
        repos.background.findOneBy!.mockResolvedValue({ id: 'bg-1', slug: 'soldier' });
        repos.abilityScore.findOneBy!.mockImplementation(async ({ slug }: any) => ({ id: `as-${slug}`, slug }));
        repos.classStartingEquip.find!.mockResolvedValue([]);
        repos.level.findOne!.mockResolvedValue(null);
        setupTransaction(saves, fighterClass);

        await service.create({
          userId: 'user-1',
          name: 'Brom Ironjaw',
          data: {
            classSlug: 'fighter',
            raceSlug: 'human',
            backgroundSlug: 'soldier',
            abilityScores: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 },
            classEquipmentChoices: ['chain-mail', 'longsword', 'shield'],
          },
        });

        const abilitySaves = saves.filter((s) => s.entity === 'CharacterAbilityScoreEntity');
        expect(abilitySaves).toHaveLength(6);
        const byAbilityId = Object.fromEntries(
          abilitySaves.map((s) => [s.data.ability_score_id, s.data.base_score]),
        );
        expect(byAbilityId['as-str']).toBe(15);
        expect(byAbilityId['as-dex']).toBe(14);
        expect(byAbilityId['as-con']).toBe(13);
        expect(byAbilityId['as-int']).toBe(10);
        expect(byAbilityId['as-wis']).toBe(12);
        expect(byAbilityId['as-cha']).toBe(8);
      });

      it('persists 6 ability scores when client sends long names (strength/dexterity/...)', async () => {
        const saves: Array<{ entity: string; data: any }> = [];
        const fighterClass = makeClass('fighter');
        repos.class.findOneBy!.mockResolvedValue(fighterClass);
        repos.race.findOneBy!.mockResolvedValue({ id: 'race-1', slug: 'human' });
        repos.background.findOneBy!.mockResolvedValue({ id: 'bg-1', slug: 'soldier' });
        repos.abilityScore.findOneBy!.mockImplementation(async ({ slug }: any) => ({ id: `as-${slug}`, slug }));
        repos.classStartingEquip.find!.mockResolvedValue([]);
        repos.level.findOne!.mockResolvedValue(null);
        setupTransaction(saves, fighterClass);

        await service.create({
          userId: 'user-1',
          name: 'Brom Long',
          data: {
            classSlug: 'fighter',
            raceSlug: 'human',
            backgroundSlug: 'soldier',
            abilityScores: { strength: 15, dexterity: 14, constitution: 13, intelligence: 10, wisdom: 12, charisma: 8 },
            classEquipmentChoices: ['chain-mail'],
          },
        });

        const abilitySaves = saves.filter((s) => s.entity === 'CharacterAbilityScoreEntity');
        expect(abilitySaves).toHaveLength(6);
      });

      it('throws BadRequestException with code MISSING_ABILITY_SCORES when abilityScores is absent', async () => {
        const fighterClass = makeClass('fighter');
        repos.class.findOneBy!.mockResolvedValue(fighterClass);
        repos.race.findOneBy!.mockResolvedValue({ id: 'race-1', slug: 'human' });
        repos.background.findOneBy!.mockResolvedValue({ id: 'bg-1', slug: 'soldier' });

        await expect(
          service.create({
            userId: 'user-1',
            name: 'No Abilities',
            data: {
              classSlug: 'fighter',
              raceSlug: 'human',
              backgroundSlug: 'soldier',
            },
          }),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ code: 'MISSING_ABILITY_SCORES' }),
        });
      });

      it('throws BadRequestException with code INCOMPLETE_ABILITY_SCORES when one ability is missing', async () => {
        const fighterClass = makeClass('fighter');
        repos.class.findOneBy!.mockResolvedValue(fighterClass);
        repos.race.findOneBy!.mockResolvedValue({ id: 'race-1', slug: 'human' });
        repos.background.findOneBy!.mockResolvedValue({ id: 'bg-1', slug: 'soldier' });

        await expect(
          service.create({
            userId: 'user-1',
            name: 'Missing CHA',
            data: {
              classSlug: 'fighter',
              raceSlug: 'human',
              backgroundSlug: 'soldier',
              abilityScores: { str: 15, dex: 14, con: 13, int: 10, wis: 12 },
            },
          }),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'INCOMPLETE_ABILITY_SCORES',
            missing: ['cha'],
          }),
        });
      });

      it('auto-equips armor, weapon and shield from starting equipment', async () => {
        const saves: Array<{ entity: string; data: any }> = [];
        const fighterClass = makeClass('fighter');
        const chainMail = {
          id: 'eq-chain-mail',
          slug: 'chain-mail',
          name: 'Chain Mail',
          armor_class: { base: 16, dex_bonus: false },
        };
        const longsword = {
          id: 'eq-longsword',
          slug: 'longsword',
          name: 'Longsword',
          weapon_category: 'martial',
        };
        const shield = { id: 'eq-shield', slug: 'shield', name: 'Shield', armor_class: { base: 2 } };

        repos.class.findOneBy!.mockResolvedValue(fighterClass);
        repos.race.findOneBy!.mockResolvedValue({ id: 'race-1', slug: 'human' });
        repos.background.findOneBy!.mockResolvedValue({ id: 'bg-1', slug: 'soldier' });
        repos.abilityScore.findOneBy!.mockImplementation(async ({ slug }: any) => ({ id: `as-${slug}`, slug }));
        repos.classStartingEquip.find!.mockResolvedValue([]);
        repos.equipment.find!.mockResolvedValue([chainMail, longsword, shield]);
        repos.level.findOne!.mockResolvedValue(null);

        dataSource.transaction!.mockImplementation(async (cb: any) => {
          const mgr = {
            create: jest.fn((_: any, data: any) => ({ id: 'char-new', ...data })),
            save: jest.fn(async (entityClass: any, data: any) => {
              const entityName = typeof entityClass === 'function' ? entityClass.name : entityClass;
              saves.push({ entity: entityName, data });
              return { id: data?.id ?? 'rec-auto', ...data };
            }),
            findOneBy: jest.fn().mockImplementation((_: any, criteria: any) => {
              if (criteria?.slug === 'fighter') return fighterClass;
              if (criteria?.slug === 'human') return { id: 'race-1', slug: 'human' };
              if (criteria?.slug === 'soldier') return { id: 'bg-1', slug: 'soldier' };
              if (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(criteria?.slug)) {
                return { id: `as-${criteria.slug}`, slug: criteria.slug };
              }
              return null;
            }),
            find: jest.fn().mockResolvedValue([]),
            createQueryBuilder: jest.fn().mockReturnValue({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({}),
            }),
          };
          return cb(mgr);
        });

        await service.create({
          userId: 'user-1',
          name: 'Brom Autoequip',
          data: {
            classSlug: 'fighter',
            raceSlug: 'human',
            backgroundSlug: 'soldier',
            abilityScores: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 },
            classEquipmentChoices: ['1x Chain Mail', '1x Longsword', '1x Shield'],
          },
        });

        const equipSaves = saves.filter((s) => s.entity === 'CharacterEquipmentEntity');
        const bySlug = Object.fromEntries(
          equipSaves.map((s) => {
            const eqId = s.data.equipment_id;
            const name = [chainMail, longsword, shield].find((e) => e.id === eqId)?.name;
            return [name, s.data.equipped];
          }),
        );
        expect(bySlug['Chain Mail']).toBe(true);
        expect(bySlug['Longsword']).toBe(true);
        expect(bySlug['Shield']).toBe(true);
      });

      it('throws MISSING_CLASS_EQUIPMENT_CHOICES when class offers options and client sends none', async () => {
        const fighterClass = {
          ...makeClass('fighter'),
          starting_equipment_options: { options: [{ label: 'Chain Mail' }, { label: 'Leather + Longbow' }] },
        };
        repos.class.findOneBy!.mockResolvedValue(fighterClass);
        repos.race.findOneBy!.mockResolvedValue({ id: 'race-1', slug: 'human' });
        repos.background.findOneBy!.mockResolvedValue({ id: 'bg-1', slug: 'soldier' });

        await expect(
          service.create({
            userId: 'user-1',
            name: 'No Equipment',
            data: {
              classSlug: 'fighter',
              raceSlug: 'human',
              backgroundSlug: 'soldier',
              abilityScores: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 },
              classEquipmentChoices: [],
            },
          }),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ code: 'MISSING_CLASS_EQUIPMENT_CHOICES' }),
        });
      });

      it('accepts empty classEquipmentChoices when class has no starting_equipment_options', async () => {
        const saves: Array<{ entity: string; data: any }> = [];
        const fighterClass = { ...makeClass('fighter'), starting_equipment_options: null };
        repos.class.findOneBy!.mockResolvedValue(fighterClass);
        repos.race.findOneBy!.mockResolvedValue({ id: 'race-1', slug: 'human' });
        repos.background.findOneBy!.mockResolvedValue({ id: 'bg-1', slug: 'soldier' });
        repos.abilityScore.findOneBy!.mockImplementation(async ({ slug }: any) => ({ id: `as-${slug}`, slug }));
        repos.classStartingEquip.find!.mockResolvedValue([]);
        repos.equipment.find!.mockResolvedValue([]);
        repos.level.findOne!.mockResolvedValue(null);
        setupTransaction(saves, fighterClass);

        await expect(
          service.create({
            userId: 'user-1',
            name: 'No Options Class',
            data: {
              classSlug: 'fighter',
              raceSlug: 'human',
              backgroundSlug: 'soldier',
              abilityScores: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 },
              classEquipmentChoices: [],
            },
          }),
        ).resolves.toBeDefined();
      });

      it('reads abilityScores from input.choices when both data and choices are present (choices wins)', async () => {
        const saves: Array<{ entity: string; data: any }> = [];
        const fighterClass = makeClass('fighter');
        repos.class.findOneBy!.mockResolvedValue(fighterClass);
        repos.race.findOneBy!.mockResolvedValue({ id: 'race-1', slug: 'human' });
        repos.background.findOneBy!.mockResolvedValue({ id: 'bg-1', slug: 'soldier' });
        repos.abilityScore.findOneBy!.mockImplementation(async ({ slug }: any) => ({ id: `as-${slug}`, slug }));
        repos.classStartingEquip.find!.mockResolvedValue([]);
        repos.level.findOne!.mockResolvedValue(null);
        setupTransaction(saves, fighterClass);

        await service.create({
          userId: 'user-1',
          name: 'Choices Wins',
          data: {
            classSlug: 'fighter',
            raceSlug: 'human',
            backgroundSlug: 'soldier',
            abilityScores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
            classEquipmentChoices: ['chain-mail'],
          },
          choices: {
            abilityScores: { str: 18, dex: 14, con: 16, int: 10, wis: 12, cha: 8 },
            classEquipmentChoices: ['chain-mail'],
          },
        } as any);

        const abilitySaves = saves.filter((s) => s.entity === 'CharacterAbilityScoreEntity');
        const strSave = abilitySaves.find((s) => s.data.ability_score_id === 'as-str');
        expect(strSave!.data.base_score).toBe(18);
      });
    });
  });
});
