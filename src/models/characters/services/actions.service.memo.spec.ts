import { NotFoundException } from "@nestjs/common";
import { ActionsService } from "src/models/characters/services/actions.service";
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
 * Guarda de orçamento de queries (perf 2026-07-27): `getAction` re-buscava 7
 * das mesmas tabelas filhas que `computeSheet` já havia carregado, e era
 * chamado várias vezes no mesmo comando de combate.
 */
describe("ActionsService — orçamento de queries por request", () => {
  let repos: Record<string, ReturnType<typeof createMockRepository>>;

  const buildService = (requestCache?: unknown) =>
    new ActionsService(
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
      repos.spell as any,
      requestCache as any,
    );

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
      spell: createMockRepository(),
    };

    repos.character.findOne!.mockResolvedValue(
      makeCharacter({ character_origin: makeCharacterOrigin() }),
    );
    repos.charClass.find!.mockResolvedValue([makeCharacterClass("fighter", 1)]);
    repos.charAbility.find!.mockResolvedValue(makeCharacterAbilityScores());
    repos.charState.findOne!.mockResolvedValue(
      makeCharacterState({ current_hp: 10 }),
    );
  });

  it("resolve as ações uma única vez para o mesmo (userId, characterId)", async () => {
    const { cache } = createActiveRequestCache();
    const service = buildService(cache);

    const first = await service.getActions("user-1", "char-1");
    const second = await service.getActions("user-1", "char-1");

    expect(repos.charState.findOne).toHaveBeenCalledTimes(1);
    expect(repos.charEquip.find).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("não serve as ações memoizadas para outro usuário", async () => {
    const { cache } = createActiveRequestCache();
    const service = buildService(cache);

    await service.getActions("user-1", "char-1");

    // O userId faz parte da chave justamente para o memo não poder burlar o
    // guard de leitura de outro usuário.
    await expect(service.getActions("user-2", "char-1")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("recomputa depois de invalidateCharacter (usos de feature mudaram)", async () => {
    const { cache } = createActiveRequestCache();
    const service = buildService(cache);

    await service.getActions("user-1", "char-1");
    cache.invalidateCharacter("char-1");
    await service.getActions("user-1", "char-1");

    expect(repos.charState.findOne).toHaveBeenCalledTimes(2);
  });

  it("sem RequestCache injetado, cada chamada recomputa", async () => {
    const service = buildService(undefined);

    await service.getActions("user-1", "char-1");
    await service.getActions("user-1", "char-1");

    expect(repos.charState.findOne).toHaveBeenCalledTimes(2);
  });
});
