import { NotFoundException } from "@nestjs/common";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { createActiveRequestCache } from "src/common/request-cache/__tests__/fake-cls";
import { createMockRepository } from "src/shared/test-utils/mock-repositories";
import {
  makeCharacter,
  makeCharacterAbilityScores,
  makeCharacterClass,
  makeCharacterOrigin,
  makeCharacterState,
  resetIdCounter,
} from "src/shared/test-utils/entity-factories";

/**
 * Guarda de orçamento de queries (perf 2026-07-27): um POST
 * /encounters/:id/attack chamava `computeSheet` 6-10x para o MESMO personagem,
 * e cada chamada custa 17 statements no Neon (~11ms de RTT cada). Este spec
 * falha se o memo por request for removido ou se a chave deixar de colapsar
 * chamadas idênticas.
 */
describe("CharacterSheetService — orçamento de queries por request", () => {
  let repos: Record<string, ReturnType<typeof createMockRepository>>;

  const buildService = (requestCache?: unknown) =>
    new CharacterSheetService(
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
      requestCache as any,
    );

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

    repos.character.findOne!.mockResolvedValue(makeCharacter());
    repos.charClass.find!.mockResolvedValue([makeCharacterClass("fighter", 1)]);
    repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
    repos.charState.findOne!.mockResolvedValue(
      makeCharacterState({ current_hp: 10 }),
    );
    repos.charOrigin.findOne!.mockResolvedValue(makeCharacterOrigin());
  });

  it("computa a ficha uma única vez para o mesmo (userId, characterId)", async () => {
    const { cache } = createActiveRequestCache();
    const service = buildService(cache);

    const first = await service.computeSheet("user-1", "char-1");
    const second = await service.computeSheet("user-1", "char-1");

    expect(repos.charState.findOne).toHaveBeenCalledTimes(1);
    expect(repos.charAbility.find).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("não confunde personagens diferentes", async () => {
    const { cache } = createActiveRequestCache();
    const service = buildService(cache);

    await service.computeSheet("user-1", "char-1");
    await service.computeSheet("user-1", "char-2");

    expect(repos.charState.findOne).toHaveBeenCalledTimes(2);
  });

  it("não serve a ficha memoizada para outro usuário", async () => {
    const { cache } = createActiveRequestCache();
    const service = buildService(cache);

    await service.computeSheet("user-1", "char-1");

    // O userId faz parte da chave justamente para o memo não poder burlar o
    // guard de leitura de outro usuário.
    await expect(service.computeSheet("user-2", "char-1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("recomputa depois de invalidateCharacter (escrita no meio do comando)", async () => {
    const { cache } = createActiveRequestCache();
    const service = buildService(cache);

    await service.computeSheet("user-1", "char-1");
    cache.invalidateCharacter("char-1");
    await service.computeSheet("user-1", "char-1");

    expect(repos.charState.findOne).toHaveBeenCalledTimes(2);
  });

  it("sem RequestCache injetado, cada chamada recomputa", async () => {
    const service = buildService(undefined);

    await service.computeSheet("user-1", "char-1");
    await service.computeSheet("user-1", "char-1");

    expect(repos.charState.findOne).toHaveBeenCalledTimes(2);
  });
});
