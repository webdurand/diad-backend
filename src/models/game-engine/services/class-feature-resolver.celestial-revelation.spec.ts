import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Celestial Revelation", () => {
  function setup() {
    const source = {
      id: "aasimar-1",
      encounterId: "encounter-1",
      displayName: "Aasimar",
      faction: "ally",
      positionX: 5,
      positionY: 5,
      isDefeated: false,
      effectInstances: [] as Array<Record<string, any>>,
    };
    const enemy = {
      id: "enemy-1",
      encounterId: "encounter-1",
      type: "monster",
      displayName: "Ogre",
      faction: "enemy",
      positionX: 6,
      positionY: 5,
      isDefeated: false,
      effectInstances: [] as Array<Record<string, any>>,
      monster: { charisma: 7 },
    };
    const participants = {
      findOne: jest.fn(async ({ where: { id } }) =>
        id === source.id ? source : id === enemy.id ? enemy : null,
      ),
      find: jest.fn().mockResolvedValue([source, enemy]),
      save: jest.fn(async (value) => value),
    };
    let effectId = 0;
    const effectInstances = {
      addEffect: jest.fn(async (target, input) => {
        const effect = {
          id: `effect-${++effectId}`,
          ...input,
          appliedAt: "2026-07-25T00:00:00.000Z",
        };
        target.effectInstances = [...target.effectInstances, effect];
        return {
          effect,
          events: [
            {
              event_type: "effect_applied",
              target_participant_id: target.id,
              data: {
                kind: input.kind,
                sourceFeatureSlug: input.sourceFeatureSlug,
                payload: input.payload,
              },
            },
          ],
        };
      }),
    };
    const conditionLifecycle = {
      applyCondition: jest.fn(async (target, input) => ({
        events: [
          {
            event_type: "condition_applied",
            target_participant_id: target.id,
            data: { slug: input.slug },
          },
        ],
        instance: {
          slug: input.slug,
          durationRoundsRemaining: input.durationRoundsRemaining,
        },
        concentrationBroken: false,
      })),
    };
    const dice = { roll: jest.fn().mockReturnValue(1) };
    const service = new ClassFeatureResolverService(
      participants as any,
      {} as any,
      conditionLifecycle as any,
      effectInstances as any,
      dice as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const caster = {
      profBonus: 5,
      classLevel: 15,
      speed: 30,
      abilityMods: { cha: 5 },
    };
    return {
      service,
      source,
      enemy,
      participants,
      effectInstances,
      conditionLifecycle,
      dice,
      caster,
    };
  }

  it("aplica Asas Celestiais e voo igual ao deslocamento por 10 rodadas", async () => {
    const { service, source, effectInstances, caster } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "celestial-revelation",
      options: { form: "heavenly-wings" },
      caster,
    });

    expect(result.resolved).toBe(true);
    expect(effectInstances.addEffect).toHaveBeenCalledTimes(2);
    expect(source.effectInstances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "celestial_revelation",
          payload: expect.objectContaining({
            form: "heavenly-wings",
            extraDamageAmount: 5,
            damageType: "radiant",
          }),
          expiresAt: { kind: "rounds", value: 10 },
        }),
        expect.objectContaining({
          kind: "flight_speed",
          payload: { amount: 30, form: "heavenly-wings" },
        }),
      ]),
    );
  });

  it("Manto Necrótico força CAR CD 18 e aplica Amedrontado aos inimigos próximos", async () => {
    const {
      service,
      source,
      enemy,
      conditionLifecycle,
      dice,
      caster,
    } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "celestial-revelation",
      options: { form: "necrotic-shroud" },
      caster,
    });

    expect(result.resolved).toBe(true);
    expect(dice.roll).toHaveBeenCalledWith(20);
    expect(conditionLifecycle.applyCondition).toHaveBeenCalledWith(
      enemy,
      expect.objectContaining({
        slug: "frightened",
        source: "feature:celestial-revelation",
        durationRoundsRemaining: null,
      }),
    );
    expect(source.effectInstances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "celestial_revelation",
          payload: expect.objectContaining({
            frightenedTargetIds: [enemy.id],
            fearSourceTurnsRemaining: 2,
          }),
        }),
      ]),
    );
    expect(result.resolutionPayload).toEqual(
      expect.objectContaining({
        saveDc: 18,
        frightenedTargets: [enemy.id],
        damageType: "necrotic",
      }),
    );
  });

  it("rejeita forma ausente sem criar efeito", async () => {
    const { service, source, effectInstances, caster } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "celestial-revelation",
      caster,
    });

    expect(result.resolved).toBe(false);
    expect(effectInstances.addEffect).not.toHaveBeenCalled();
  });
});
