import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Wild Resurgence", () => {
  function setup(
    featureUses: Record<string, number>,
    spellSlotsUsed: Record<string, number>,
    effectInstances: Array<Record<string, unknown>> = [],
  ) {
    const source = {
      id: "druid-1",
      characterId: "char-1",
      effectInstances,
    };
    const state = {
      character_id: "char-1",
      feature_uses_used: featureUses,
      spell_slots_used: spellSlotsUsed,
    };
    const participants = {
      findOne: jest.fn().mockResolvedValue(source),
      save: jest.fn(async (value) => value),
    };
    const charStates = {
      findOne: jest.fn().mockResolvedValue(state),
      save: jest.fn(async (value) => value),
    };
    const service = new ClassFeatureResolverService(
      participants as any,
      charStates as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, source, state, participants, charStates };
  }

  it("troca um slot por um uso quando Forma Selvagem está zerada", async () => {
    const { service, source, state, participants } = setup(
      { "wild-shape": 4 },
      { "2": 0 },
    );

    const result = await service.resolveInvocation("druid-1", {
      featureSlug: "wild-resurgence",
      options: {
        direction: "slot-to-wild-shape",
        slotLevel: 2,
      },
      caster: {
        classLevel: 20,
        is2024Rules: true,
        spellSlots: [{ level: 2, total: 3, used: 0 }],
      },
    });

    expect(result.resolved).toBe(true);
    expect(state.feature_uses_used["wild-shape"]).toBe(3);
    expect(state.spell_slots_used["2"]).toBe(1);
    expect(source.effectInstances).toContainEqual(
      expect.objectContaining({
        kind: "wild_resurgence_slot_to_wild_shape_used_turn",
        expiresAt: { kind: "caster_turn_ends", value: 1 },
      }),
    );
    expect(participants.save).toHaveBeenCalledWith(source);
    expect(result.events.at(-1)?.data).toEqual(
      expect.objectContaining({
        direction: "slot-to-wild-shape",
        slotLevel: 2,
        wildShapeRemaining: 1,
      }),
    );
  });

  it("troca um uso de Forma Selvagem por um slot de nível 1 gasto", async () => {
    const { service, state } = setup(
      { "wild-shape": 1 },
      { "1": 2 },
    );

    const result = await service.resolveInvocation("druid-1", {
      featureSlug: "wild-resurgence",
      options: { direction: "wild-shape-to-slot" },
      caster: {
        classLevel: 20,
        is2024Rules: true,
        spellSlots: [{ level: 1, total: 4, used: 2 }],
      },
    });

    expect(result.resolved).toBe(true);
    expect(state.feature_uses_used).toEqual(
      expect.objectContaining({
        "wild-shape": 2,
        "wild-resurgence-slot-recovery": 1,
      }),
    );
    expect(state.spell_slots_used["1"]).toBe(1);
    expect(result.events.at(-1)?.data).toEqual(
      expect.objectContaining({
        direction: "wild-shape-to-slot",
        slotLevel: 1,
        slotUsedAfter: 1,
        slotTotal: 4,
      }),
    );
  });

  it("rejeita recuperar Forma Selvagem enquanto ainda resta uso", async () => {
    const { service, charStates } = setup(
      { "wild-shape": 3 },
      { "1": 0 },
    );

    const result = await service.resolveInvocation("druid-1", {
      featureSlug: "wild-resurgence",
      options: {
        direction: "slot-to-wild-shape",
        slotLevel: 1,
      },
      caster: {
        classLevel: 20,
        is2024Rules: true,
        spellSlots: [{ level: 1, total: 4, used: 0 }],
      },
    });

    expect(result.resolved).toBe(false);
    expect(charStates.save).not.toHaveBeenCalled();
    expect(result.events.at(-1)?.data?.error).toContain(
      "quando não resta nenhum uso",
    );
  });

  it("limita a recuperação de slot a uma vez por descanso longo", async () => {
    const { service, charStates } = setup(
      {
        "wild-shape": 1,
        "wild-resurgence-slot-recovery": 1,
      },
      { "1": 2 },
    );

    const result = await service.resolveInvocation("druid-1", {
      featureSlug: "wild-resurgence",
      options: { direction: "wild-shape-to-slot" },
      caster: {
        classLevel: 20,
        is2024Rules: true,
        spellSlots: [{ level: 1, total: 4, used: 2 }],
      },
    });

    expect(result.resolved).toBe(false);
    expect(charStates.save).not.toHaveBeenCalled();
    expect(result.events.at(-1)?.data?.error).toContain(
      "já foi usada neste descanso longo",
    );
  });
});
