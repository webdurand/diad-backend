import { CharacterStateService } from "src/models/characters/services/character-state.service";
import { createActiveRequestCache } from "src/common/request-cache/__tests__/fake-cls";
import { createMockRepository } from "src/shared/test-utils/mock-repositories";

/**
 * O `RequestCacheSubscriber` só escuta eventos do ORM. Este spec guarda
 * o buraco correspondente: os writers que escrevem em `character_state` por SQL
 * cru têm de invalidar o memo por request à mão, senão a ficha memoizada no
 * mesmo comando de combate serve usos de feature obsoletos.
 */
describe("CharacterStateService — invalidação de memo em escritas SQL cru", () => {
  let repos: Record<string, ReturnType<typeof createMockRepository>>;

  const buildService = (requestCache?: unknown) =>
    new CharacterStateService(
      repos.character as any,
      repos.state as any,
      repos.charClass as any,
      repos.charAbility as any,
      repos.charLevelUp as any,
      repos.partyMember as any,
      requestCache as any,
    );

  beforeEach(() => {
    repos = {
      character: createMockRepository(),
      state: createMockRepository(),
      charClass: createMockRepository(),
      charAbility: createMockRepository(),
      charLevelUp: createMockRepository(),
      partyMember: createMockRepository(),
    };
    repos.state.query = jest.fn().mockResolvedValue([{ next: 1 }]);
  });

  it("incrementFeatureUses derruba o memo do personagem", async () => {
    const { cache } = createActiveRequestCache();
    const loader = jest.fn().mockResolvedValue("ficha");
    await cache.getOrLoad("sheet|char-1|user-1", loader);

    await buildService(cache).incrementFeatureUses("char-1", "second-wind");

    await cache.getOrLoad("sheet|char-1|user-1", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("incrementFeatureUses funciona sem RequestCache injetado", async () => {
    await expect(
      buildService(undefined).incrementFeatureUses("char-1", "second-wind"),
    ).resolves.toBe(1);
  });
});
