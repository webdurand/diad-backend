import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — efeitos do acerto do Druida", () => {
  function setup(critical = false) {
    const source = {
      id: "druid-1",
      characterId: "character-1",
      encounterId: "encounter-1",
      effectInstances: [
        {
          id: "pending-1",
          kind: "druid_hit_rider_pending",
          sourceFeatureSlug: "druid-hit-riders",
          payload: {
            requiredTargetId: "target-1",
            hitWasCritical: critical,
            primalStrikeAvailable: true,
            lunarRadianceAvailable: true,
            damageTypes: ["cold", "fire", "lightning", "thunder"],
            diceExpression: "2d8",
            lunarRadianceDice: "2d10",
          },
        },
      ] as any[],
    };
    const target = {
      id: "target-1",
      encounterId: "encounter-1",
      currentHp: 100,
      tempHp: 0,
      isDefeated: false,
      monster: {
        damage_immunities: [],
        damage_resistances: [],
        damage_vulnerabilities: [],
      },
      effectInstances: [],
    };
    const participants = {
      findOne: jest.fn(async ({ where: { id } }: any) =>
        id === source.id ? source : id === target.id ? target : null,
      ),
      save: jest.fn(async (value: any) => value),
    };
    let effectSequence = 0;
    const effectInstances = {
      addEffect: jest.fn(async (participant: any, input: any) => {
        const effect = { id: `effect-${++effectSequence}`, ...input };
        participant.effectInstances = [
          ...(participant.effectInstances ?? []),
          effect,
        ];
        return {
          effect,
          events: [{ event_type: "effect_applied", data: input }],
        };
      }),
    };
    const dice = {
      rollExpression: jest.fn((expression: string) => {
        const totals: Record<string, { total: number; rolls: number[] }> = {
          "2d8": { total: 10, rolls: [4, 6] },
          "2d10": { total: 12, rolls: [6, 6] },
          "4d8": { total: 20, rolls: [4, 6, 5, 5] },
          "4d10": { total: 24, rolls: [6, 6, 6, 6] },
        };
        return totals[expression];
      }),
    };
    const conditionLifecycle = {
      removeConditionsEndedByDamage: jest.fn().mockResolvedValue([]),
    };
    const service = new ClassFeatureResolverService(
      participants as never,
      { findOne: jest.fn(), save: jest.fn() } as never,
      conditionLifecycle as never,
      effectInstances as never,
      dice as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, source, target, participants, effectInstances, dice };
  }

  it("aplica Ataque Primordial e Forma Lunar no mesmo acerto e marca ambos no turno", async () => {
    const { service, source, target, effectInstances } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "druid-hit-riders",
      targets: [target.id],
      options: {
        usePrimalStrike: true,
        primalDamageType: "fire",
        useLunarRadiance: true,
      },
    });

    expect(result.resolved).toBe(true);
    expect(target.currentHp).toBe(78);
    expect(result.resolutionPayload).toEqual(
      expect.objectContaining({
        totalFinalDamage: 22,
        hpAfter: 78,
        targetDefeated: false,
      }),
    );
    expect(effectInstances.addEffect).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ kind: "primal_strike_used_this_turn" }),
    );
    expect(effectInstances.addEffect).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ kind: "lunar_radiance_used_this_turn" }),
    );
    expect(
      result.events.filter((event) => event.event_type === "damage_applied"),
    ).toHaveLength(2);
  });

  it("dobra os dados adicionais em acerto crítico", async () => {
    const { service, source, target, dice } = setup(true);

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "druid-hit-riders",
      targets: [target.id],
      options: {
        usePrimalStrike: true,
        primalDamageType: "thunder",
        useLunarRadiance: true,
      },
    });

    expect(result.resolved).toBe(true);
    expect(dice.rollExpression).toHaveBeenNthCalledWith(1, "4d8");
    expect(dice.rollExpression).toHaveBeenNthCalledWith(2, "4d10");
    expect(target.currentHp).toBe(56);
  });

  it("permite recusar sem causar dano nem consumir os limites do turno", async () => {
    const { service, source, target, effectInstances } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "druid-hit-riders",
      targets: [target.id],
      options: {
        usePrimalStrike: false,
        useLunarRadiance: false,
      },
    });

    expect(result.resolved).toBe(true);
    expect(target.currentHp).toBe(100);
    expect(source.effectInstances).toEqual([]);
    expect(effectInstances.addEffect).not.toHaveBeenCalled();
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "druid_hit_riders_declined",
        }),
      ]),
    );
  });
});
