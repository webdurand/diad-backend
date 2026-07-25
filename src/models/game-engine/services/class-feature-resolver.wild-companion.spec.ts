import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Wild Companion", () => {
  const source = {
    id: "druid-1",
    encounterId: "enc-1",
    characterId: "char-1",
    faction: "ally",
    positionX: 4,
    positionY: 5,
  };

  function setup(initialState: {
    feature_uses_used: Record<string, number>;
    spell_slots_used: Record<string, number>;
  }) {
    const state = {
      character_id: "char-1",
      ...initialState,
    };
    const participantRepo = {
      findOne: jest.fn().mockResolvedValue(source),
    };
    const stateRepo = {
      findOne: jest.fn().mockResolvedValue(state),
      save: jest.fn(async (value) => value),
    };
    const summoning = {
      getSummonsOf: jest.fn().mockResolvedValue([]),
      dismissSummon: jest.fn(),
      spawnSummon: jest.fn().mockResolvedValue({
        id: "familiar-1",
        displayName: "Companheiro Selvagem — Coruja",
      }),
    };
    const service = new ClassFeatureResolverService(
      participantRepo as any,
      stateRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      summoning as any,
    );
    return { service, state, stateRepo, summoning };
  }

  it("invoca familiar Feérico e consome um uso de Forma Selvagem", async () => {
    const { service, state, stateRepo, summoning } = setup({
      feature_uses_used: { "wild-shape": 1 },
      spell_slots_used: {},
    });

    const result = await service.resolveInvocation("druid-1", {
      featureSlug: "wild-companion",
      encounterId: "enc-1",
      options: {
        form: "owl",
        resourceKind: "wild-shape",
      },
      caster: {
        classLevel: 20,
        is2024Rules: true,
        spellSlots: [],
      },
    });

    expect(result.resolved).toBe(true);
    expect(state.feature_uses_used["wild-shape"]).toBe(2);
    expect(stateRepo.save).toHaveBeenCalledWith(state);
    expect(summoning.spawnSummon).toHaveBeenCalledWith(
      "enc-1",
      expect.objectContaining({
        casterParticipantId: "druid-1",
        monsterSlug: "owl",
        source: "find-familiar-spell",
        metadata: expect.objectContaining({
          familiarCreatureType: "fey",
          wildCompanion: true,
          expiresOnLongRest: true,
          cannotAttack: true,
        }),
      }),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "wild_companion_summoned",
        target_participant_id: "familiar-1",
        data: expect.objectContaining({
          resourceKind: "wild-shape",
          wildShapeUsed: 2,
          wildShapeMax: 4,
        }),
      }),
    );
  });

  it("consome o slot escolhido sem gastar Forma Selvagem", async () => {
    const { service, state, summoning } = setup({
      feature_uses_used: { "wild-shape": 0 },
      spell_slots_used: { "2": 1 },
    });

    const result = await service.resolveInvocation("druid-1", {
      featureSlug: "wild-companion",
      encounterId: "enc-1",
      options: {
        form: "cat",
        resourceKind: "spell-slot",
        slotLevel: 2,
      },
      caster: {
        classLevel: 20,
        is2024Rules: true,
        spellSlots: [{ level: 2, total: 3, used: 1 }],
      },
    });

    expect(result.resolved).toBe(true);
    expect(state.spell_slots_used["2"]).toBe(2);
    expect(state.feature_uses_used["wild-shape"]).toBe(0);
    expect(summoning.spawnSummon).toHaveBeenCalledWith(
      "enc-1",
      expect.objectContaining({
        monsterSlug: "cat",
        metadata: expect.objectContaining({
          familiarCreatureType: "fey",
        }),
      }),
    );
    expect(result.events.at(-1)?.data).toEqual(
      expect.objectContaining({
        resourceKind: "spell-slot",
        slotLevel: 2,
      }),
    );
  });

  it("não cria token nem consome recurso quando a Forma Selvagem acabou", async () => {
    const { service, stateRepo, summoning } = setup({
      feature_uses_used: { "wild-shape": 4 },
      spell_slots_used: {},
    });

    const result = await service.resolveInvocation("druid-1", {
      featureSlug: "wild-companion",
      encounterId: "enc-1",
      options: {
        form: "owl",
        resourceKind: "wild-shape",
      },
      caster: {
        classLevel: 20,
        is2024Rules: true,
        spellSlots: [],
      },
    });

    expect(result.resolved).toBe(false);
    expect(stateRepo.save).not.toHaveBeenCalled();
    expect(summoning.spawnSummon).not.toHaveBeenCalled();
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "class_feature_error",
        data: expect.objectContaining({
          error: "Não há usos de Forma Selvagem disponíveis.",
        }),
      }),
    );
  });
});
