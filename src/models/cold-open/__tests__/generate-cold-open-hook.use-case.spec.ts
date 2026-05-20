import { GenerateColdOpenHookUseCase } from "../application/generate-cold-open-hook.use-case";
import { OPENING_ARCHETYPES } from "../domain/opening-archetype-catalog";

function repo(value: unknown) {
  const list = Array.isArray(value) ? value : [value].filter(Boolean);
  return {
    find: jest.fn().mockResolvedValue(list),
    findOne: jest.fn().mockResolvedValue(Array.isArray(value) ? (value[0] ?? null) : value),
    save: jest.fn(async (entity: any) => entity),
  };
}

describe("GenerateColdOpenHookUseCase", () => {
  it("persists coldOpenHook and emits cold_open_generated with W3C traceId", async () => {
    const scene = {
      id: "33333333-3333-4333-8333-333333333333",
      sessionId: "11111111-1111-4111-8111-111111111111",
      sceneNumber: 1,
      locationId: "loc-1",
      coldOpenHook: null,
    };
    const sceneRepo = repo(scene);
    const sessionRepo = repo({
      id: scene.sessionId,
      campaignId: "22222222-2222-4222-8222-222222222222",
      characterIds: ["44444444-4444-4444-8444-444444444444"],
    });
    const campaignRepo = repo({
      id: "22222222-2222-4222-8222-222222222222",
      tonalAnchor: { narratorVoice: "investigativo-misterioso" },
      generationSeed: {
        storySeed: {
          protagonistHook: "Um mentor desaparecido deixou uma chave sem fechadura.",
        },
      },
    });
    const archetypeRepo = repo(OPENING_ARCHETYPES);
    const locationRepo = repo({
      id: "loc-1",
      name: "Observatório Partido",
      type: "ruin",
      atmosphere: "poeira de prata",
    });
    const npcRepo = repo([]);
    const questRepo = repo({
      id: "quest-1",
      name: "A Chave Sem Fechadura",
      isMainQuest: true,
      status: "active",
      objectives: [{ description: "Encontrar o mentor.", status: "active", priority: 1, sortOrder: 1 }],
    });
    const pcPersonaService = {
      assemblePersona: jest.fn().mockResolvedValue({
        characterId: "44444444-4444-4444-8444-444444444444",
        name: "Maguin",
        race: "High Elf",
        subrace: null,
        class: "Wizard",
        subclass: null,
        level: 3,
        background: "Sage",
        alignment: "true-neutral",
        personality: { bond: "My mentor vanished." },
        currentHpPercent: 100,
        conditionsActive: [],
        keyEquipmentSummary: [],
      }),
    };
    const envelope = {
      source: { traceId: "0123456789abcdef0123456789abcdef" },
    };
    const envelopeFactory = { build: jest.fn().mockReturnValue(envelope) };
    const eventBus = { publish: jest.fn().mockResolvedValue(envelope) };
    const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), setContext: jest.fn() };

    const useCase = new GenerateColdOpenHookUseCase(
      sceneRepo as any,
      archetypeRepo as any,
      sessionRepo as any,
      campaignRepo as any,
      locationRepo as any,
      npcRepo as any,
      questRepo as any,
      pcPersonaService as any,
      eventBus as any,
      envelopeFactory as any,
      logger as any,
    );

    const hook = await useCase.execute(scene as any);

    expect(hook).not.toBeNull();
    expect(sceneRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        coldOpenHook: expect.objectContaining({
          archetypeKey: expect.any(String),
          seed: expect.stringMatching(/^[a-f0-9]{16,64}$/),
          scoringTrace: expect.objectContaining({
            pcTags: expect.arrayContaining(["wizard", "caster", "bond:mentor"]),
          }),
        }),
      }),
    );
    expect(envelopeFactory.build).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: "NarrativeEvent",
        eventType: "cold_open_generated",
        audiences: ["Narrator", "Director", "HUD", "Archivist"],
        scope: expect.objectContaining({
          campaignId: "22222222-2222-4222-8222-222222222222",
          sessionId: scene.sessionId,
          sceneId: scene.id,
        }),
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({
          traceId: expect.stringMatching(/^[a-f0-9]{32}$/),
        }),
      }),
    );
  });

  it("adds initial focal NPC metadata when archetype opens in dialogue", async () => {
    const scene = {
      id: "33333333-3333-4333-8333-333333333333",
      sessionId: "11111111-1111-4111-8111-111111111111",
      sceneNumber: 1,
      locationId: "loc-1",
      coldOpenHook: null,
    };
    const sceneRepo = repo(scene);
    const sessionRepo = repo({
      id: scene.sessionId,
      campaignId: "22222222-2222-4222-8222-222222222222",
      characterIds: ["44444444-4444-4444-8444-444444444444"],
    });
    const campaignRepo = repo({
      id: "22222222-2222-4222-8222-222222222222",
      tonalAnchor: { narratorVoice: "investigativo-misterioso" },
      generationSeed: { storySeed: { protagonistHook: "Um juramento quebrado." } },
    });
    const archetypeRepo = repo([
      OPENING_ARCHETYPES.find((item) => item.key === "encontro_fatidico"),
    ]);
    const locationRepo = repo({
      id: "loc-1",
      name: "Taverna do Marinheiro Perdido",
      type: "tavern",
      atmosphere: "fumaça e sal",
    });
    const npcRepo = repo({
      id: "npc-focal",
      campaignId: "22222222-2222-4222-8222-222222222222",
      name: "Araci",
      title: "contrabandista",
      race: "human",
      description: "olhar cortante e dedos imóveis sobre a mesa",
      motivation: "cobrar a verdade antes que a guarda chegue",
    });
    const questRepo = repo({
      id: "quest-1",
      name: "O Juramento Quebrado",
      isMainQuest: true,
      status: "active",
      objectives: [
        {
          description: "Descobrir quem vendeu o mercador.",
          status: "active",
          priority: 1,
          sortOrder: 1,
        },
      ],
    });
    const pcPersonaService = {
      assemblePersona: jest.fn().mockResolvedValue({
        characterId: "44444444-4444-4444-8444-444444444444",
        name: "Dmurad",
        race: "Human",
        subrace: null,
        class: "Bard",
        subclass: null,
        level: 1,
        background: "Criminal",
        alignment: "true-neutral",
        personality: {},
        currentHpPercent: 100,
        conditionsActive: [],
        keyEquipmentSummary: [],
      }),
    };
    const envelope = { source: { traceId: "0123456789abcdef0123456789abcdef" } };
    const envelopeFactory = { build: jest.fn().mockReturnValue(envelope) };
    const eventBus = { publish: jest.fn().mockResolvedValue(envelope) };
    const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), setContext: jest.fn() };

    const useCase = new GenerateColdOpenHookUseCase(
      sceneRepo as any,
      archetypeRepo as any,
      sessionRepo as any,
      campaignRepo as any,
      locationRepo as any,
      npcRepo as any,
      questRepo as any,
      pcPersonaService as any,
      eventBus as any,
      envelopeFactory as any,
      logger as any,
    );

    const hook = await useCase.execute(scene as any);

    expect(hook).toEqual(
      expect.objectContaining({
        archetypeKey: "encontro_fatidico",
        initialFocalNpcId: "npc-focal",
        initialFocalNpcSlot: "npc.encounter.focal",
      }),
    );
    expect(sceneRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        coldOpenHook: expect.objectContaining({
          initialFocalNpcId: "npc-focal",
        }),
      }),
    );
  });
});
