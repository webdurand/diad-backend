import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Faithful Steed", () => {
  const source = {
    id: "paladin-1",
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
        id: "steed-1",
        displayName: "Corcel Extraplanar — Cavalo Celestial",
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

  it("invoca o corcel gratuitamente uma vez por descanso longo", async () => {
    const { service, state, summoning } = setup({
      feature_uses_used: {},
      spell_slots_used: {},
    });

    const result = await service.resolveInvocation("paladin-1", {
      featureSlug: "faithful-steed",
      encounterId: "enc-1",
      options: {
        appearance: "horse",
        creatureType: "celestial",
        resourceKind: "free-cast",
      },
      caster: {
        abilityMods: { cha: 4 },
        profBonus: 5,
        classLevel: 15,
        is2024Rules: true,
        spellSlots: [],
      },
    });

    expect(result.resolved).toBe(true);
    expect(state.feature_uses_used["faithful-steed-free-cast"]).toBe(1);
    expect(summoning.spawnSummon).toHaveBeenCalledWith(
      "enc-1",
      expect.objectContaining({
        casterParticipantId: "paladin-1",
        monsterSlug: "warhorse",
        source: "find-steed-spell",
        controlMode: "own-initiative",
        durationRoundsTotal: null,
        statBlock: expect.objectContaining({
          kind: "otherworldly-steed",
          slotLevel: 2,
          armorClass: 12,
          maxHp: 25,
          speed: 60,
          attack: expect.objectContaining({
            attackBonus: 9,
            damageBonus: 2,
            damageType: "radiant",
          }),
        }),
        metadata: expect.objectContaining({
          steedAppearance: "horse",
          steedCreatureType: "celestial",
          lifeBond: true,
        }),
      }),
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "faithful_steed_summoned",
        target_participant_id: "steed-1",
        data: expect.objectContaining({
          resourceKind: "free-cast",
          slotLevel: 2,
          armorClass: 12,
          maxHp: 25,
          damageType: "radiant",
        }),
      }),
    );
  });

  it("usa slot superior, concede voo e substitui o corcel anterior", async () => {
    const existingSteed = {
      id: "steed-old",
      appliedEffects: [
        {
          kind: "summon",
          refId: "find-steed-spell",
          metadata: { source: "find-steed-spell" },
        },
      ],
    };
    const { service, state, summoning } = setup({
      feature_uses_used: { "faithful-steed-free-cast": 1 },
      spell_slots_used: { "4": 0 },
    });
    summoning.getSummonsOf.mockResolvedValue([existingSteed]);
    summoning.dismissSummon.mockResolvedValue({
      removed: true,
      events: [{ event_type: "summon_dismissed" }],
    });

    const result = await service.resolveInvocation("paladin-1", {
      featureSlug: "faithful-steed",
      encounterId: "enc-1",
      options: {
        appearance: "dire-wolf",
        creatureType: "fey",
        resourceKind: "spell-slot",
        slotLevel: 4,
      },
      caster: {
        abilityMods: { cha: 3 },
        profBonus: 4,
        classLevel: 15,
        is2024Rules: true,
        spellSlots: [{ level: 4, total: 2, used: 0 }],
      },
    });

    expect(result.resolved).toBe(true);
    expect(state.spell_slots_used["4"]).toBe(1);
    expect(summoning.dismissSummon).toHaveBeenCalledWith(
      "steed-old",
      "form-change",
    );
    expect(summoning.spawnSummon).toHaveBeenCalledWith(
      "enc-1",
      expect.objectContaining({
        monsterSlug: "dire-wolf",
        statBlock: expect.objectContaining({
          slotLevel: 4,
          armorClass: 14,
          maxHp: 45,
          movementModes: { walk: 60, fly: 60 },
          attack: expect.objectContaining({
            damageType: "psychic",
          }),
          steed: expect.objectContaining({
            bonusAction: "fey-step",
          }),
        }),
      }),
    );
  });

  it("não cria token quando a conjuração gratuita já foi usada", async () => {
    const { service, stateRepo, summoning } = setup({
      feature_uses_used: { "faithful-steed-free-cast": 1 },
      spell_slots_used: {},
    });

    const result = await service.resolveInvocation("paladin-1", {
      featureSlug: "faithful-steed",
      encounterId: "enc-1",
      options: {
        appearance: "elk",
        creatureType: "fiend",
        resourceKind: "free-cast",
      },
      caster: {
        classLevel: 15,
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
          error:
            "A conjuração gratuita de Corcel Fiel já foi usada neste descanso longo.",
        }),
      }),
    );
  });
});
