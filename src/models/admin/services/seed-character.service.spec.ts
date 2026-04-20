import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { createMockRepository } from '../../../shared/test-utils/mock-repositories';
import { SeedCharacterService } from './seed-character.service';
import { SeedCharacterDto } from '../dto/seed-character.dto';

describe('SeedCharacterService', () => {
  let service: SeedCharacterService;
  let charactersService: { create: jest.Mock };
  let characterSheetService: { computeSheet: jest.Mock };
  let userRepo: ReturnType<typeof createMockRepository>;
  let characterRepo: ReturnType<typeof createMockRepository>;
  let classRepo: ReturnType<typeof createMockRepository>;
  let subclassRepo: ReturnType<typeof createMockRepository>;

  const validDto: SeedCharacterDto = {
    classSlug: 'wizard',
    subclassSlug: 'evocation',
    level: 1,
    edition: 'XPHB',
  };

  const mockClass = { id: 'class-wizard', slug: 'wizard' };
  const mockSubclass = {
    id: 'sub-evoc',
    slug: 'evocation',
    class_id: 'class-wizard',
  };
  const mockUser = { id: 'user-e2e', email: 'e2e-harness@diad.local' };
  const mockCharacter = { id: 'char-1', name: 'wizard-L1-e2e' };
  const mockSheet = {
    totalLevel: 1,
    maxHp: 8,
    armorClass: 12,
    proficiencyBonus: 2,
    spellSlots: [
      { level: 1, total: 2, used: 0 },
    ],
  };

  beforeEach(() => {
    charactersService = { create: jest.fn().mockResolvedValue(mockCharacter) };
    characterSheetService = {
      computeSheet: jest.fn().mockResolvedValue(mockSheet),
    };
    userRepo = createMockRepository();
    characterRepo = createMockRepository();
    classRepo = createMockRepository();
    subclassRepo = createMockRepository();

    classRepo.findOneBy = jest.fn().mockResolvedValue(mockClass);
    subclassRepo.findOneBy = jest.fn().mockResolvedValue(mockSubclass);
    userRepo.findOneBy = jest.fn().mockImplementation(({ email, id }) => {
      if (email === 'e2e-harness@diad.local') return Promise.resolve(mockUser);
      if (id === 'user-e2e') return Promise.resolve(mockUser);
      return Promise.resolve(null);
    });
    characterRepo.findOne = jest.fn().mockResolvedValue(null);

    service = new SeedCharacterService(
      charactersService as never,
      characterSheetService as never,
      userRepo as never,
      characterRepo as never,
      classRepo as never,
      subclassRepo as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      { save: jest.fn().mockResolvedValue({}) } as never,
    );
  });

  describe('L1 happy path', () => {
    it('cria PC L1 com defaults da classe', async () => {
      const result = await service.seed(validDto);

      expect(result.id).toBe('char-1');
      expect(result.name).toBe('wizard-L1-e2e');
      expect(result.sheetSummary.level).toBe(1);
      expect(result.sheetSummary.hpMax).toBe(8);
      expect(result.sheetSummary.spellSlots).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('aloca 15 na ability prim\u00e1ria da classe (Wizard\u2192INT)', async () => {
      await service.seed(validDto);
      const createCall = charactersService.create.mock.calls[0][0];
      const abilityScores = createCall.data.abilityScores;
      expect(abilityScores.int).toBe(15); // primary
      expect(abilityScores.con).toBe(14); // sempre CON secund\u00e1rio
    });

    it('aloca 15 na STR pra Fighter', async () => {
      classRepo.findOneBy = jest.fn().mockResolvedValue({ id: 'class-fighter', slug: 'fighter' });
      subclassRepo.findOneBy = jest.fn().mockResolvedValue({
        id: 'sub-champion',
        slug: 'champion',
        class_id: 'class-fighter',
      });
      await service.seed({
        ...validDto,
        classSlug: 'fighter',
        subclassSlug: 'champion',
      });
      const createCall = charactersService.create.mock.calls[0][0];
      expect(createCall.data.abilityScores.str).toBe(15);
    });

    it('respeita abilityArray customizado', async () => {
      await service.seed({ ...validDto, abilityArray: [20, 18, 16, 14, 12, 10] });
      const createCall = charactersService.create.mock.calls[0][0];
      expect(createCall.data.abilityScores).toEqual({
        str: 20,
        dex: 18,
        con: 16,
        int: 14,
        wis: 12,
        cha: 10,
      });
    });

    it('nome default \u00e9 <class>-L<level>-e2e', async () => {
      await service.seed(validDto);
      const createCall = charactersService.create.mock.calls[0][0];
      expect(createCall.name).toBe('wizard-L1-e2e');
    });

    it('respeita name customizado', async () => {
      await service.seed({ ...validDto, name: 'Gandalf' });
      const createCall = charactersService.create.mock.calls[0][0];
      expect(createCall.name).toBe('Gandalf');
    });

    it('usa owner E2E default quando ownerUserId n\u00e3o fornecido', async () => {
      await service.seed(validDto);
      const createCall = charactersService.create.mock.calls[0][0];
      expect(createCall.userId).toBe('user-e2e');
    });

    it('usa edition XPHB no data payload', async () => {
      await service.seed(validDto);
      const createCall = charactersService.create.mock.calls[0][0];
      expect(createCall.data.sourceCode).toBe('XPHB');
      // Spec 012: agora usa classEquipmentChoices ['A'] (materializa starter pack)
      // em vez de classStartingGold (que deixava fighter/ranger sem armas).
      expect(createCall.data.classEquipmentChoices).toEqual(['A']);
    });
  });

  describe('L10/L20 stub', () => {
    it('retorna 501 em L10', async () => {
      await expect(service.seed({ ...validDto, level: 10 })).rejects.toThrow(
        NotImplementedException,
      );
    });

    it('retorna 501 em L20 com characterId pra iteracao seguinte', async () => {
      try {
        await service.seed({ ...validDto, level: 20 });
        fail('esperava NotImplementedException');
      } catch (err) {
        expect(err).toBeInstanceOf(NotImplementedException);
        const response = (err as NotImplementedException).getResponse() as {
          code: string;
          characterId: string;
        };
        expect(response.code).toBe('LEVEL_UP_NOT_YET_IMPLEMENTED');
        expect(response.characterId).toBe('char-1');
      }
    });
  });

  describe('valida\u00e7\u00e3o', () => {
    it('rejeita classSlug inexistente', async () => {
      classRepo.findOneBy = jest.fn().mockResolvedValue(null);
      await expect(service.seed(validDto)).rejects.toThrow(BadRequestException);
    });

    it('rejeita subclassSlug inexistente', async () => {
      subclassRepo.findOneBy = jest.fn().mockResolvedValue(null);
      await expect(service.seed(validDto)).rejects.toThrow(BadRequestException);
    });

    it('rejeita subclass que n\u00e3o pertence \u00e0 classe', async () => {
      subclassRepo.findOneBy = jest.fn().mockResolvedValue({
        id: 'sub-berserker',
        slug: 'berserker',
        class_id: 'class-barbarian', // n\u00e3o bate com wizard
      });
      await expect(service.seed(validDto)).rejects.toThrow(BadRequestException);
    });

    it('rejeita quando E2E user n\u00e3o est\u00e1 seedado e ownerUserId ausente', async () => {
      userRepo.findOneBy = jest.fn().mockResolvedValue(null);
      await expect(service.seed(validDto)).rejects.toThrow(NotFoundException);
    });

    it('rejeita ownerUserId explicito inexistente', async () => {
      userRepo.findOneBy = jest.fn().mockImplementation(({ email }) => {
        if (email) return Promise.resolve(mockUser);
        return Promise.resolve(null);
      });
      await expect(
        service.seed({
          ...validDto,
          ownerUserId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejeita duplicata de nome pro mesmo owner', async () => {
      characterRepo.findOne = jest
        .fn()
        .mockResolvedValue({ id: 'existing', name: 'wizard-L1-e2e' });
      await expect(service.seed(validDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('normalizeSpellSlots', () => {
    it('aceita shape real do sheet [{ level, total, used }]', async () => {
      characterSheetService.computeSheet = jest.fn().mockResolvedValue({
        ...mockSheet,
        spellSlots: [
          { level: 1, total: 4, used: 0 },
          { level: 2, total: 3, used: 1 },
          { level: 3, total: 2, used: 0 },
        ],
      });
      const result = await service.seed(validDto);
      expect(result.sheetSummary.spellSlots).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    });

    it('omite spellSlots pra classes n\u00e3o-caster (array vazio)', async () => {
      characterSheetService.computeSheet = jest.fn().mockResolvedValue({
        ...mockSheet,
        spellSlots: [],
      });
      const result = await service.seed(validDto);
      expect(result.sheetSummary.spellSlots).toBeUndefined();
    });

    it('aceita spellSlots como objeto { 1: 2, 2: 0, ... }', async () => {
      characterSheetService.computeSheet = jest.fn().mockResolvedValue({
        ...mockSheet,
        spellSlots: { 1: 2, 2: 0, 3: 0 },
      });
      const result = await service.seed(validDto);
      expect(result.sheetSummary.spellSlots).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('aceita spellSlots undefined', async () => {
      characterSheetService.computeSheet = jest.fn().mockResolvedValue({
        ...mockSheet,
        spellSlots: undefined,
      });
      const result = await service.seed(validDto);
      expect(result.sheetSummary.spellSlots).toBeUndefined();
    });
  });
});
