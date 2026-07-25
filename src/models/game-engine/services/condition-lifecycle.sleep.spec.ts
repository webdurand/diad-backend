import { ConditionLifecycleService } from "./condition-lifecycle.service";

describe("ConditionLifecycleService — Sleep 2024", () => {
  it("turns Incapacitated into Unconscious after the failed second save", async () => {
    const participants = { save: jest.fn(async (value) => value) };
    const service = new ConditionLifecycleService(
      participants as any,
      {} as any,
      { checkBreakOnCondition: jest.fn() } as any,
      { roll: jest.fn(() => 5) } as any,
    );
    const target = {
      id: "target",
      conditions: ["incapacitated"],
      conditionInstances: [
        {
          id: "sleep-condition",
          slug: "incapacitated",
          appliedBy: "caster",
          sourceSpell: "sleep",
          sourceConcentration: true,
          source: "spell:sleep",
          saveAbility: "wis",
          saveDc: 18,
          repeatSaveTiming: "end_of_turn",
          durationRoundsRemaining: 10,
          appliedAt: new Date().toISOString(),
        },
      ],
    };

    const result = await service.processEndOfTurn(
      target as any,
      async () => ({ modifier: 0, advantage: false, disadvantage: false }),
    );

    expect(target.conditions).toEqual(["unconscious"]);
    expect(target.conditionInstances[0]).toMatchObject({
      slug: "unconscious",
      repeatSaveTiming: "never",
      durationRoundsRemaining: 9,
      sourceConcentration: true,
    });
    expect(result.events.map((event) => event.event_type)).toEqual([
      "end_of_turn_save_rolled",
      "condition_removed",
      "condition_applied",
    ]);
    expect(participants.save).toHaveBeenCalledWith(target);
  });

  it("removes Incapacitated after a successful second save", async () => {
    const participants = { save: jest.fn(async (value) => value) };
    const service = new ConditionLifecycleService(
      participants as any,
      {} as any,
      { checkBreakOnCondition: jest.fn() } as any,
      { roll: jest.fn(() => 20) } as any,
    );
    const target = {
      id: "target",
      conditions: ["incapacitated"],
      conditionInstances: [
        {
          id: "sleep-condition",
          slug: "incapacitated",
          appliedBy: "caster",
          sourceSpell: "sleep",
          sourceConcentration: true,
          source: "spell:sleep",
          saveAbility: "wis",
          saveDc: 18,
          repeatSaveTiming: "end_of_turn",
          durationRoundsRemaining: 10,
          appliedAt: new Date().toISOString(),
        },
      ],
    };

    const result = await service.processEndOfTurn(
      target as any,
      async () => ({ modifier: 0, advantage: false, disadvantage: false }),
    );

    expect(target.conditions).toEqual([]);
    expect(target.conditionInstances).toEqual([]);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "condition_removed",
          data: expect.objectContaining({
            slug: "incapacitated",
            removalReason: "target_saved",
          }),
        }),
      ]),
    );
    expect(participants.save).toHaveBeenCalledWith(target);
  });
});
