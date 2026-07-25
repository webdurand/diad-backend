import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Large Form", () => {
  function setup() {
    const source = {
      id: "goliath-1",
      characterId: "char-1",
      movementRemaining: 35,
      effectInstances: [] as Array<Record<string, any>>,
    };
    const participants = {
      findOne: jest.fn().mockResolvedValue(source),
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
              data: { kind: input.kind },
            },
          ],
        };
      }),
      removeEffect: jest.fn(async (target, id) => {
        const before = target.effectInstances.length;
        target.effectInstances = target.effectInstances.filter(
          (effect) => effect.id !== id,
        );
        return {
          removed: target.effectInstances.length < before,
          events: [
            {
              event_type: "effect_expired",
              target_participant_id: target.id,
              data: { effectId: id, reason: "manual" },
            },
          ],
        };
      }),
    };
    const service = new ClassFeatureResolverService(
      participants as any,
      {} as any,
      {} as any,
      effectInstances as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, source, participants, effectInstances };
  }

  it("aplica tamanho, vantagem e +10 ft por 100 rodadas", async () => {
    const { service, source, effectInstances } = setup();

    const result = await service.resolveInvocation("goliath-1", {
      featureSlug: "large-form",
      caster: { speed: 35, classLevel: 20 },
    });

    expect(result.resolved).toBe(true);
    expect(source.movementRemaining).toBe(45);
    expect(source.effectInstances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "self_advantage",
          payload: { scope: "str-check", size: "large" },
          expiresAt: { kind: "rounds", value: 100 },
        }),
        expect.objectContaining({
          kind: "speed_bonus",
          payload: { amount: 10, size: "large" },
          expiresAt: { kind: "rounds", value: 100 },
        }),
      ]),
    );
    expect(effectInstances.addEffect).toHaveBeenCalledTimes(2);
    expect(result.events.at(-1)).toEqual(
      expect.objectContaining({
        event_type: "large_form_activated",
        data: expect.objectContaining({
          previousSpeed: 35,
          newSpeed: 45,
          strengthChecksHaveAdvantage: true,
        }),
      }),
    );
  });

  it("encerra sem ação e preserva o movimento que já foi gasto", async () => {
    const { service, source, effectInstances } = setup();
    await service.resolveInvocation("goliath-1", {
      featureSlug: "large-form",
      caster: { speed: 35, classLevel: 20 },
    });
    source.movementRemaining = 35;

    const result = await service.resolveInvocation("goliath-1", {
      featureSlug: "large-form-end",
      caster: { speed: 35, classLevel: 20 },
    });

    expect(result.resolved).toBe(true);
    expect(source.effectInstances).toEqual([]);
    expect(source.movementRemaining).toBe(25);
    expect(effectInstances.removeEffect).toHaveBeenCalledTimes(2);
    expect(result.events.at(-1)).toEqual(
      expect.objectContaining({
        event_type: "large_form_ended",
        data: expect.objectContaining({
          previousSpeed: 45,
          newSpeed: 35,
          movementRemaining: 25,
        }),
      }),
    );
  });
});
