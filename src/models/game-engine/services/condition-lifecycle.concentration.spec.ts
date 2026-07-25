import { ConditionLifecycleService } from "./condition-lifecycle.service";

describe("ConditionLifecycleService concentration tracking", () => {
  it("registra a condição antes de verificar incapacitação do conjurador", async () => {
    const caster = {
      id: "caster",
      type: "pc",
      conditions: [],
      conditionInstances: [],
      isConcentrating: true,
    };
    const participants = {
      save: jest.fn(async (value) => value),
      findOne: jest.fn(async () => caster),
    };
    const concentration = {
      trackAppliedEffect: jest.fn(async () => undefined),
      checkBreakOnCondition: jest.fn(async () => ({
        events: [],
        broken: true,
      })),
    };
    const service = new ConditionLifecycleService(
      participants as never,
      {} as never,
      concentration as never,
      {} as never,
    );

    await service.applyCondition(caster as never, {
      slug: "paralyzed",
      appliedBy: caster.id,
      sourceSpell: "hold-person",
      sourceConcentration: true,
      saveAbility: "wis",
      saveDc: 17,
      repeatSaveTiming: "end_of_turn",
      durationRoundsRemaining: 10,
    });

    expect(concentration.trackAppliedEffect).toHaveBeenCalledWith(
      caster,
      expect.objectContaining({
        kind: "condition",
        targetParticipantId: caster.id,
      }),
    );
    expect(
      concentration.trackAppliedEffect.mock.invocationCallOrder[0],
    ).toBeLessThan(
      concentration.checkBreakOnCondition.mock.invocationCallOrder[0],
    );
  });
});
