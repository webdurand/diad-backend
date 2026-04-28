import { NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import {
  CharacterEntity,
  CharacterAbilityScoreEntity,
  CharacterClassEntity,
  CharacterEquipmentEntity,
  CharacterMagicItemEntity,
  CharacterStateEntity,
  CharacterLevelUpEntity,
  CharacterOriginEntity,
} from "src/entities";
import { PcPersonaService } from "../services/pc-persona.service";

interface FakeRepo {
  find: jest.Mock;
  findOne: jest.Mock;
}

function repoOf(rows: unknown[] | unknown | null): FakeRepo {
  const list = Array.isArray(rows) ? rows : [];
  const first = Array.isArray(rows) ? (rows[0] ?? null) : (rows ?? null);
  return {
    find: jest.fn().mockResolvedValue(list),
    findOne: jest.fn().mockResolvedValue(first),
  };
}

const CHARACTER_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function makeCharacter(): CharacterEntity {
  return {
    id: CHARACTER_ID,
    name: "Aelara",
    userId: USER_ID,
  } as unknown as CharacterEntity;
}

function makeOrigin(
  overrides: Partial<CharacterOriginEntity> = {},
): CharacterOriginEntity {
  return {
    character_id: CHARACTER_ID,
    race: { slug: "tiefling", name: "Tiefling" } as any,
    subrace: null as any,
    background: { slug: "soldier", name: "Soldado" } as any,
    alignment: { slug: "lawful-good", name: "Leal Bom" } as any,
    personality: {
      trait: "Mantém a calma diante do caos.",
      ideal: "Honra acima da vida.",
      bond: "Vingar a morte do irmão Tobias.",
      flaw: "Soberba — recusa pedir ajuda.",
      backstory:
        "Filha de mercenários, treinou desde cedo. Após o sumiço do irmão jurou caçar Cragmaw.",
    },
    ...overrides,
  } as unknown as CharacterOriginEntity;
}

function makeClass(): CharacterClassEntity {
  return {
    character_id: CHARACTER_ID,
    class: { slug: "paladin", name: "Paladino", hit_die: 10 } as any,
    subclass: { slug: "oath-of-devotion", name: "Juramento da Devoção" } as any,
    class_level: 3,
    order: 1,
  } as unknown as CharacterClassEntity;
}

function makeAbilities(con = 14): CharacterAbilityScoreEntity[] {
  return [
    {
      ability_score: { slug: "con", name: "Constituição" } as any,
      base_score: con,
      bonus: 0,
    },
    {
      ability_score: { slug: "str", name: "Força" } as any,
      base_score: 16,
      bonus: 0,
    },
  ] as unknown as CharacterAbilityScoreEntity[];
}

function makeState(
  overrides: Partial<CharacterStateEntity> = {},
): CharacterStateEntity {
  return {
    character_id: CHARACTER_ID,
    current_hp: 14,
    max_hp_bonus: 0,
    conditions: ["frightened"],
    ...overrides,
  } as unknown as CharacterStateEntity;
}

function makeLevelUps(): CharacterLevelUpEntity[] {
  return [
    { hp_gained: 7, total_level: 2 } as any,
    { hp_gained: 6, total_level: 3 } as any,
  ] as unknown as CharacterLevelUpEntity[];
}

function makeEquipment(): CharacterEquipmentEntity[] {
  return [
    {
      equipped: true,
      equipment: {
        slug: "longsword",
        name: "Longsword",
        weapon_category: "martial",
      } as any,
    },
    {
      equipped: true,
      equipment: {
        slug: "chain-mail",
        name: "Chain Mail",
        armor_class: { base: 16 },
      } as any,
    },
    {
      equipped: false,
      equipment: { slug: "dagger", name: "Dagger" } as any,
    },
  ] as unknown as CharacterEquipmentEntity[];
}

function makeMagicItems(): CharacterMagicItemEntity[] {
  return [
    {
      attuned: true,
      magic_item: {
        slug: "ring-of-protection",
        name: "Ring of Protection",
      } as any,
    },
  ] as unknown as CharacterMagicItemEntity[];
}

function buildService(opts: {
  character?: CharacterEntity | null;
  origin?: CharacterOriginEntity | null;
  classes?: CharacterClassEntity[];
  abilities?: CharacterAbilityScoreEntity[];
  state?: CharacterStateEntity | null;
  levelUps?: CharacterLevelUpEntity[];
  equipment?: CharacterEquipmentEntity[];
  magicItems?: CharacterMagicItemEntity[];
}): PcPersonaService {
  return new PcPersonaService(
    repoOf(opts.character ?? null) as unknown as Repository<CharacterEntity>,
    repoOf(opts.classes ?? []) as unknown as Repository<CharacterClassEntity>,
    repoOf(opts.abilities ?? []) as unknown as Repository<CharacterAbilityScoreEntity>,
    repoOf(opts.state ?? null) as unknown as Repository<CharacterStateEntity>,
    repoOf(opts.levelUps ?? []) as unknown as Repository<CharacterLevelUpEntity>,
    repoOf(opts.equipment ?? []) as unknown as Repository<CharacterEquipmentEntity>,
    repoOf(opts.magicItems ?? []) as unknown as Repository<CharacterMagicItemEntity>,
    repoOf(opts.origin ?? null) as unknown as Repository<CharacterOriginEntity>,
  );
}

describe("PcPersonaService", () => {
  it("monta persona completa de um Paladino L3 Tiefling", async () => {
    const service = buildService({
      character: makeCharacter(),
      origin: makeOrigin(),
      classes: [makeClass()],
      abilities: makeAbilities(14),
      state: makeState({ current_hp: 14 }),
      levelUps: makeLevelUps(),
      equipment: makeEquipment(),
      magicItems: makeMagicItems(),
    });

    const persona = await service.assemblePersona(CHARACTER_ID, USER_ID);

    expect(persona.characterId).toBe(CHARACTER_ID);
    expect(persona.name).toBe("Aelara");
    expect(persona.race).toBe("Tiefling");
    expect(persona.class).toBe("Paladino");
    expect(persona.subclass).toBe("Juramento da Devoção");
    expect(persona.level).toBe(3);
    expect(persona.background).toBe("Soldado");
    expect(persona.alignment).toBe("lawful-good");
    expect(persona.personality.bond).toContain("Tobias");
    expect(persona.personality.flaw).toContain("Soberba");
    expect(persona.conditionsActive).toEqual(["frightened"]);
    // maxHp = 10 (hitDie) + 2 (con mod) + 7 + 6 (level ups) = 25; current_hp 14 → 56%
    expect(persona.currentHpPercent).toBe(56);
    expect(persona.keyEquipmentSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "longsword", kind: "weapon" }),
        expect.objectContaining({ slug: "chain-mail", kind: "armor" }),
        expect.objectContaining({
          slug: "ring-of-protection",
          kind: "magic-item",
          attuned: true,
        }),
      ]),
    );
    // Não-equipados ficam fora.
    expect(
      persona.keyEquipmentSummary.find((e) => e.slug === "dagger"),
    ).toBeUndefined();
  });

  it("trunca backstory acima de 2000 chars (token bloat mitigation)", async () => {
    const longStory = "x".repeat(2500);
    const service = buildService({
      character: makeCharacter(),
      origin: makeOrigin({
        personality: { backstory: longStory },
      }),
      classes: [makeClass()],
      abilities: makeAbilities(14),
      state: makeState(),
      levelUps: makeLevelUps(),
    });

    const persona = await service.assemblePersona(CHARACTER_ID, USER_ID);
    expect(persona.personality.backstory!.length).toBeLessThanOrEqual(2000);
    expect(persona.personality.backstory!.endsWith("…")).toBe(true);
  });

  it("preserva chaves customizadas em personality (additionalProperties)", async () => {
    const service = buildService({
      character: makeCharacter(),
      origin: makeOrigin({
        personality: {
          bond: "Mestre desaparecido",
          favoriteFood: "Maçã caramelada",
        } as Record<string, string>,
      }),
      classes: [makeClass()],
      abilities: makeAbilities(14),
      state: makeState(),
      levelUps: makeLevelUps(),
    });

    const persona = await service.assemblePersona(CHARACTER_ID, USER_ID);
    expect(persona.personality.bond).toBe("Mestre desaparecido");
    expect(persona.personality.favoriteFood).toBe("Maçã caramelada");
  });

  it("retorna alignment 'unaligned' quando origin sem alignment registrado", async () => {
    const service = buildService({
      character: makeCharacter(),
      origin: makeOrigin({ alignment: null as any }),
      classes: [makeClass()],
      abilities: makeAbilities(14),
      state: makeState(),
      levelUps: makeLevelUps(),
    });

    const persona = await service.assemblePersona(CHARACTER_ID, USER_ID);
    expect(persona.alignment).toBe("unaligned");
  });

  it("currentHpPercent clampado em 0 quando current_hp negativo", async () => {
    const service = buildService({
      character: makeCharacter(),
      origin: makeOrigin(),
      classes: [makeClass()],
      abilities: makeAbilities(14),
      state: makeState({ current_hp: -5 }),
      levelUps: makeLevelUps(),
    });

    const persona = await service.assemblePersona(CHARACTER_ID, USER_ID);
    expect(persona.currentHpPercent).toBe(0);
  });

  it("levanta NotFoundException se character não existe", async () => {
    const service = buildService({ character: null });
    await expect(
      service.assemblePersona(CHARACTER_ID, USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("levanta NotFoundException se origin ausente", async () => {
    const service = buildService({
      character: makeCharacter(),
      origin: null,
    });
    await expect(
      service.assemblePersona(CHARACTER_ID, USER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("permite acesso interno (userId=null) sem ownership check", async () => {
    const service = buildService({
      character: makeCharacter(),
      origin: makeOrigin(),
      classes: [makeClass()],
      abilities: makeAbilities(14),
      state: makeState(),
      levelUps: makeLevelUps(),
    });

    const persona = await service.assemblePersona(CHARACTER_ID, null);
    expect(persona.characterId).toBe(CHARACTER_ID);
  });

  it("conditionsActive vazio quando state.conditions ausente", async () => {
    const service = buildService({
      character: makeCharacter(),
      origin: makeOrigin(),
      classes: [makeClass()],
      abilities: makeAbilities(14),
      state: makeState({ conditions: [] }),
      levelUps: makeLevelUps(),
    });

    const persona = await service.assemblePersona(CHARACTER_ID, USER_ID);
    expect(persona.conditionsActive).toEqual([]);
  });

  it("keyEquipmentSummary cap em 5 itens", async () => {
    const equipment = Array.from({ length: 8 }, (_, i) => ({
      equipped: true,
      equipment: {
        slug: `item-${i}`,
        name: `Item ${i}`,
        weapon_category: "simple",
      } as any,
    })) as unknown as CharacterEquipmentEntity[];

    const service = buildService({
      character: makeCharacter(),
      origin: makeOrigin(),
      classes: [makeClass()],
      abilities: makeAbilities(14),
      state: makeState(),
      levelUps: makeLevelUps(),
      equipment,
    });

    const persona = await service.assemblePersona(CHARACTER_ID, USER_ID);
    expect(persona.keyEquipmentSummary.length).toBeLessThanOrEqual(5);
  });
});
