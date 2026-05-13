import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  NotImplementedException,
} from "@nestjs/common";
import { createMockRepository } from "../../../shared/test-utils/mock-repositories";
import { SeedCharacterService } from "./seed-character.service";
import { SeedCharacterDto } from "../dto/seed-character.dto";
import { SpellStatusEnum } from "src/entities/enums";

describe("SeedCharacterService", () => {
  let service: SeedCharacterService;
  let charactersService: { create: jest.Mock };
  let characterSheetService: { computeSheet: jest.Mock };
  let userRepo: ReturnType<typeof createMockRepository>;
  let characterRepo: ReturnType<typeof createMockRepository>;
  let classRepo: ReturnType<typeof createMockRepository>;
  let subclassRepo: ReturnType<typeof createMockRepository>;
  let characterClassRepo: ReturnType<typeof createMockRepository>;
  let characterStateRepo: ReturnType<typeof createMockRepository>;
  let characterSpellRepo: ReturnType<typeof createMockRepository>;
  let spellClassRepo: ReturnType<typeof createMockRepository>;

  const validDto: SeedCharacterDto = {
    classSlug: "wizard",
    subclassSlug: "evocation",
    level: 1,
    edition: "XPHB",
  };

  const mockClass = { id: "class-wizard", slug: "wizard", hit_die: 6 };
  const mockSubclass = {
    id: "sub-evoc",
    slug: "evocation",
    class_id: "class-wizard",
  };
  const mockUser = { id: "user-e2e", email: "e2e-harness@diad.local" };
  const mockCharacter = { id: "char-1", name: "wizard-L1-e2e" };
  const mockSheet = {
    totalLevel: 1,
    maxHp: 8,
    armorClass: 12,
    proficiencyBonus: 2,
    spellSlots: [{ level: 1, total: 2, used: 0 }],
  };

  beforeEach(() => {
    charactersService = {
      create: jest.fn().mockImplementation((input) =>
        Promise.resolve({
          ...mockCharacter,
          name: input.name,
        }),
      ),
    };
    characterSheetService = {
      computeSheet: jest.fn().mockResolvedValue(mockSheet),
    };
    userRepo = createMockRepository();
    characterRepo = createMockRepository();
    classRepo = createMockRepository();
    subclassRepo = createMockRepository();
    characterClassRepo = createMockRepository();
    characterStateRepo = createMockRepository();
    characterSpellRepo = createMockRepository();
    spellClassRepo = createMockRepository();

    classRepo.findOneBy = jest.fn().mockResolvedValue(mockClass);
    subclassRepo.findOneBy = jest.fn().mockResolvedValue(mockSubclass);
    userRepo.findOneBy = jest.fn().mockImplementation(({ email, id }) => {
      if (email === "e2e-harness@diad.local") return Promise.resolve(mockUser);
      if (id === "user-e2e") return Promise.resolve(mockUser);
      return Promise.resolve(null);
    });
    characterRepo.findOne = jest.fn().mockResolvedValue(null);
    characterClassRepo.findOne = jest.fn().mockResolvedValue({
      id: "cc-1",
      character_id: "char-1",
      class_id: "class-wizard",
      class_level: 1,
    });
    characterStateRepo.findOne = jest.fn().mockResolvedValue({
      id: "state-1",
      character_id: "char-1",
      current_hp: 8,
      max_hp_bonus: 0,
      spell_slots_used: {},
      hit_dice_used: {},
    });
    characterSpellRepo.save = jest.fn().mockImplementation((entity) =>
      Promise.resolve(entity),
    );
    spellClassRepo.find = jest.fn().mockResolvedValue([
      {
        class_id: "class-wizard",
        spell_id: "spell-fire-bolt",
        spell: {
          id: "spell-fire-bolt",
          slug: "fire-bolt",
          name: "Fire Bolt",
          level: 0,
        },
      },
      {
        class_id: "class-wizard",
        spell_id: "spell-magic-missile",
        spell: {
          id: "spell-magic-missile",
          slug: "magic-missile",
          name: "Magic Missile",
          level: 1,
        },
      },
      {
        class_id: "class-wizard",
        spell_id: "spell-fireball",
        spell: {
          id: "spell-fireball",
          slug: "fireball",
          name: "Fireball",
          level: 3,
        },
      },
    ]);

    service = new SeedCharacterService(
      charactersService as never,
      characterSheetService as never,
      userRepo as never,
      characterRepo as never,
      classRepo as never,
      subclassRepo as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      {
        save: jest.fn().mockResolvedValue({}),
        find: jest.fn().mockResolvedValue([]),
      } as never,
      characterClassRepo as never,
      characterStateRepo as never,
      characterSpellRepo as never,
      spellClassRepo as never,
    );
  });

  describe("L1 happy path", () => {
    it("cria PC L1 com defaults da classe", async () => {
      const result = await service.seed(validDto);

      expect(result.id).toBe("char-1");
      expect(result.name).toBe("wizard-L1-e2e");
      expect(result.sheetSummary.level).toBe(1);
      expect(result.sheetSummary.hpMax).toBe(8);
      expect(result.sheetSummary.spellSlots).toEqual([
        2, 0, 0, 0, 0, 0, 0, 0, 0,
      ]);
    });

    it("aloca 15 na ability prim\u00e1ria da classe (Wizard\u2192INT)", async () => {
      await service.seed(validDto);
      const createCall = charactersService.create.mock.calls[0][0];
      const abilityScores = createCall.data.abilityScores;
      expect(abilityScores.int).toBe(15);
      expect(abilityScores.con).toBe(14);
    });

    it("aloca 15 na STR pra Fighter", async () => {
      classRepo.findOneBy = jest
        .fn()
        .mockResolvedValue({ id: "class-fighter", slug: "fighter" });
      subclassRepo.findOneBy = jest.fn().mockResolvedValue({
        id: "sub-champion",
        slug: "champion",
        class_id: "class-fighter",
      });
      await service.seed({
        ...validDto,
        classSlug: "fighter",
        subclassSlug: "champion",
      });
      const createCall = charactersService.create.mock.calls[0][0];
      expect(createCall.data.abilityScores.str).toBe(15);
    });

    it("respeita abilityArray customizado", async () => {
      await service.seed({
        ...validDto,
        abilityArray: [20, 18, 16, 14, 12, 10],
      });
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

    it("nome default \u00e9 <class>-L<level>-e2e", async () => {
      await service.seed(validDto);
      const createCall = charactersService.create.mock.calls[0][0];
      expect(createCall.name).toBe("wizard-L1-e2e");
    });

    it("respeita name customizado", async () => {
      await service.seed({ ...validDto, name: "Gandalf" });
      const createCall = charactersService.create.mock.calls[0][0];
      expect(createCall.name).toBe("Gandalf");
    });

    it("usa owner E2E default quando ownerUserId n\u00e3o fornecido", async () => {
      await service.seed(validDto);
      const createCall = charactersService.create.mock.calls[0][0];
      expect(createCall.userId).toBe("user-e2e");
    });

    it("usa edition XPHB no data payload", async () => {
      await service.seed(validDto);
      const createCall = charactersService.create.mock.calls[0][0];
      expect(createCall.data.sourceCode).toBe("XPHB");


      expect(createCall.data.classEquipmentChoices).toEqual(["A"]);
    });
  });

  describe("spell-lab", () => {
    const spellLabDto: SeedCharacterDto = {
      classSlug: "wizard",
      subclassSlug: "evocation",
      level: 20,
      edition: "XPHB",
      seedMode: "spell-lab",
      name: "SpellLab Wizard L20",
    };

    beforeEach(() => {
      characterSheetService.computeSheet = jest.fn().mockResolvedValue({
        ...mockSheet,
        totalLevel: 20,
        spellSlots: [
          { level: 1, total: 4, used: 0 },
          { level: 2, total: 3, used: 0 },
          { level: 3, total: 3, used: 0 },
          { level: 4, total: 3, used: 0 },
          { level: 5, total: 3, used: 0 },
          { level: 6, total: 2, used: 0 },
          { level: 7, total: 2, used: 0 },
          { level: 8, total: 1, used: 0 },
          { level: 9, total: 1, used: 0 },
        ],
      });
    });

    it("cria Wizard L20 sem cair no stub de level-up", async () => {
      const result = await service.seed(spellLabDto, {
        authenticatedUserId: "user-e2e",
      });

      expect(result.name).toBe("SpellLab Wizard L20");
      expect(result.sheetSummary.level).toBe(20);
      expect(result.sheetSummary.spellSlots).toEqual([
        4, 3, 3, 3, 3, 2, 2, 1, 1,
      ]);
      expect(characterClassRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          class_level: 20,
          subclass_id: "sub-evoc",
        }),
      );
    });

    it("usa o usuario autenticado como owner padrao", async () => {
      userRepo.findOneBy = jest.fn().mockImplementation(({ id, email }) => {
        if (id === "user-auth") {
          return Promise.resolve({ id: "user-auth", email: "me@diad.local" });
        }
        if (email === "e2e-harness@diad.local") {
          return Promise.resolve(mockUser);
        }
        return Promise.resolve(null);
      });

      await service.seed(spellLabDto, { authenticatedUserId: "user-auth" });

      const createCall = charactersService.create.mock.calls[0][0];
      expect(createCall.userId).toBe("user-auth");
    });

    it("grava cantrips, spellbook e override de disponibilidade", async () => {
      await service.seed(spellLabDto, {
        authenticatedUserId: "user-e2e",
      });

      expect(characterSpellRepo.delete).toHaveBeenCalledWith({
        character_id: "char-1",
      });
      const savedRows = characterSpellRepo.save.mock.calls[0][0];
      expect(savedRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            spell_id: "spell-fire-bolt",
            status: SpellStatusEnum.Known,
            always_prepared: true,
          }),
          expect.objectContaining({
            spell_id: "spell-magic-missile",
            status: SpellStatusEnum.Spellbook,
            always_prepared: true,
          }),
        ]),
      );
    });

    it("filtra o loadout para magias ready quando solicitado", async () => {
      spellClassRepo.find = jest.fn().mockResolvedValue([
        {
          class_id: "class-wizard",
          spell_id: "spell-fireball",
          spell: {
            id: "spell-fireball",
            slug: "fireball",
            name: "Fireball",
            level: 3,
          },
        },
        {
          class_id: "class-wizard",
          spell_id: "spell-unmodeled",
          spell: {
            id: "spell-unmodeled",
            slug: "unmodeled-spell",
            name: "Unmodeled Spell",
            level: 4,
          },
        },
      ]);

      await service.seed(
        { ...spellLabDto, spellLoadout: "all-ready-spells" },
        { authenticatedUserId: "user-e2e" },
      );

      const savedRows = characterSpellRepo.save.mock.calls[0][0];
      expect(savedRows).toHaveLength(1);
      expect(savedRows[0]).toEqual(
        expect.objectContaining({ spell_id: "spell-fireball" }),
      );
    });
  });

  describe("L10/L20 stub", () => {
    it("retorna 501 em L10", async () => {
      await expect(service.seed({ ...validDto, level: 10 })).rejects.toThrow(
        NotImplementedException,
      );
    });

    it("retorna 501 em L20 com characterId pra iteracao seguinte", async () => {
      try {
        await service.seed({ ...validDto, level: 20 });
        fail("esperava NotImplementedException");
      } catch (err) {
        expect(err).toBeInstanceOf(NotImplementedException);
        const response = (err as NotImplementedException).getResponse() as {
          code: string;
          characterId: string;
        };
        expect(response.code).toBe("LEVEL_UP_NOT_YET_IMPLEMENTED");
        expect(response.characterId).toBe("char-1");
      }
    });
  });

  describe("valida\u00e7\u00e3o", () => {
    it("rejeita classSlug inexistente", async () => {
      classRepo.findOneBy = jest.fn().mockResolvedValue(null);
      await expect(service.seed(validDto)).rejects.toThrow(BadRequestException);
    });

    it("rejeita subclassSlug inexistente", async () => {
      subclassRepo.findOneBy = jest.fn().mockResolvedValue(null);
      await expect(service.seed(validDto)).rejects.toThrow(BadRequestException);
    });

    it("rejeita subclass que n\u00e3o pertence \u00e0 classe", async () => {
      subclassRepo.findOneBy = jest.fn().mockResolvedValue({
        id: "sub-berserker",
        slug: "berserker",
        class_id: "class-barbarian",
      });
      await expect(service.seed(validDto)).rejects.toThrow(BadRequestException);
    });

    it("rejeita quando E2E user n\u00e3o est\u00e1 seedado e ownerUserId ausente", async () => {
      userRepo.findOneBy = jest.fn().mockResolvedValue(null);
      await expect(service.seed(validDto)).rejects.toThrow(NotFoundException);
    });

    it("rejeita ownerUserId explicito inexistente", async () => {
      userRepo.findOneBy = jest.fn().mockImplementation(({ email }) => {
        if (email) return Promise.resolve(mockUser);
        return Promise.resolve(null);
      });
      await expect(
        service.seed({
          ...validDto,
          ownerUserId: "00000000-0000-0000-0000-000000000000",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejeita duplicata de nome pro mesmo owner", async () => {
      characterRepo.findOne = jest
        .fn()
        .mockResolvedValue({ id: "existing", name: "wizard-L1-e2e" });
      await expect(service.seed(validDto)).rejects.toThrow(ConflictException);
    });
  });

  describe("normalizeSpellSlots", () => {
    it("aceita shape real do sheet [{ level, total, used }]", async () => {
      characterSheetService.computeSheet = jest.fn().mockResolvedValue({
        ...mockSheet,
        spellSlots: [
          { level: 1, total: 4, used: 0 },
          { level: 2, total: 3, used: 1 },
          { level: 3, total: 2, used: 0 },
        ],
      });
      const result = await service.seed(validDto);
      expect(result.sheetSummary.spellSlots).toEqual([
        4, 3, 2, 0, 0, 0, 0, 0, 0,
      ]);
    });

    it("omite spellSlots pra classes n\u00e3o-caster (array vazio)", async () => {
      characterSheetService.computeSheet = jest.fn().mockResolvedValue({
        ...mockSheet,
        spellSlots: [],
      });
      const result = await service.seed(validDto);
      expect(result.sheetSummary.spellSlots).toBeUndefined();
    });

    it("aceita spellSlots como objeto { 1: 2, 2: 0, ... }", async () => {
      characterSheetService.computeSheet = jest.fn().mockResolvedValue({
        ...mockSheet,
        spellSlots: { 1: 2, 2: 0, 3: 0 },
      });
      const result = await service.seed(validDto);
      expect(result.sheetSummary.spellSlots).toEqual([
        2, 0, 0, 0, 0, 0, 0, 0, 0,
      ]);
    });

    it("aceita spellSlots undefined", async () => {
      characterSheetService.computeSheet = jest.fn().mockResolvedValue({
        ...mockSheet,
        spellSlots: undefined,
      });
      const result = await service.seed(validDto);
      expect(result.sheetSummary.spellSlots).toBeUndefined();
    });
  });
});
