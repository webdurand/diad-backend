import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Stunning Strike (2024)", () => {
  const target = {
    id: "target-1",
    effectInstances: [],
    monster: { constitution: 10 },
  };
  const participants = {
    findOne: jest.fn().mockResolvedValue(target),
  };
  const conditionLifecycle = {
    applyCondition: jest.fn().mockResolvedValue({
      events: [{ event_type: "condition_applied" }],
    }),
  };
  const effectInstances = {
    addEffect: jest
      .fn()
      .mockImplementation(
        async (
          _target: unknown,
          input: {
            kind: string;
            payload: Record<string, unknown>;
            expiresAt: { kind: string; value?: number };
          },
        ) => ({
          effect: { id: `effect-${input.kind}`, ...input },
          events: [
            {
              event_type: "effect_applied",
              data: { kind: input.kind, payload: input.payload },
            },
          ],
        }),
      ),
  };
  const dice = { roll: jest.fn() };

  const makeService = () =>
    new ClassFeatureResolverService(
      participants as never,
      {} as never,
      conditionLifecycle as never,
      effectInstances as never,
      dice as never,
      {} as never,
      {} as never,
      {} as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("stuns the target on a failed Constitution save", async () => {
    dice.roll.mockReturnValue(5);

    const result = await makeService().resolveInvocation("monk-1", {
      featureSlug: "stunning-strike",
      targets: ["target-1"],
      saveDc: 13,
    });

    expect(result.resolved).toBe(true);
    expect(conditionLifecycle.applyCondition).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        slug: "stunned",
        appliedBy: "monk-1",
        sourceFeature: "stunning-strike",
      }),
    );
    expect(effectInstances.addEffect).not.toHaveBeenCalled();
  });

  it("halves Speed and exposes the target to the next attack on a successful save", async () => {
    dice.roll.mockReturnValue(18);

    const result = await makeService().resolveInvocation("monk-1", {
      featureSlug: "stunning-strike",
      targets: ["target-1"],
      saveDc: 13,
    });

    expect(result.resolved).toBe(true);
    expect(conditionLifecycle.applyCondition).not.toHaveBeenCalled();
    expect(effectInstances.addEffect).toHaveBeenNthCalledWith(
      1,
      target,
      expect.objectContaining({
        kind: "speed_multiplier",
        payload: { amount: 0.5 },
        expiresAt: { kind: "until_caster_turn", value: 1 },
      }),
    );
    expect(effectInstances.addEffect).toHaveBeenNthCalledWith(
      2,
      target,
      expect.objectContaining({
        kind: "grant_advantage_to_attackers",
        payload: { consumeOn: "targeted_by_attack" },
        expiresAt: { kind: "until_caster_turn", value: 1 },
      }),
    );
  });
});
