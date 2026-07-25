import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { ConditionLifecycleService } from "./condition-lifecycle.service";

function fearTarget(): EncounterParticipantEntity {
  const instance = {
    id: "fear-1",
    slug: "frightened",
    appliedBy: "caster-1",
    sourceSpell: "fear",
    sourceConcentration: true,
    source: "spell:fear",
    saveAbility: "wis",
    saveDc: 15,
    repeatSaveTiming: "end_of_turn",
    durationRoundsRemaining: 10,
    appliedAt: "2026-01-01T00:00:00.000Z",
  };
  return {
    id: "target-1",
    displayName: "Target",
    conditions: ["frightened"],
    conditionInstances: [instance],
  } as EncounterParticipantEntity;
}

describe("ConditionLifecycleService Fear", () => {
  it("does not allow the repeat save while the Fear source is visible", async () => {
    const target = fearTarget();
    const participants = {
      findOne: jest.fn().mockResolvedValue({
        id: "caster-1",
        conditions: [],
        isDefeated: false,
      }),
      save: jest.fn(async (value) => value),
    };
    const dice = { roll: jest.fn().mockReturnValue(20) };
    const service = new ConditionLifecycleService(
      participants as never,
      {} as never,
      {} as never,
      dice as never,
    );

    const result = await service.processEndOfTurn(target, async () => ({
      modifier: 5,
      advantage: false,
      disadvantage: false,
    }));

    expect(dice.roll).not.toHaveBeenCalled();
    expect(target.conditions).toContain("frightened");
    expect(result.events).toContainEqual(
      expect.objectContaining({ event_type: "fear_save_not_available" }),
    );
  });

  it("allows the repeat save when the Fear source is no longer visible", async () => {
    const target = fearTarget();
    const participants = {
      findOne: jest.fn().mockResolvedValue({
        id: "caster-1",
        conditions: ["hidden"],
        isDefeated: false,
      }),
      save: jest.fn(async (value) => value),
    };
    const dice = { roll: jest.fn().mockReturnValue(12) };
    const service = new ConditionLifecycleService(
      participants as never,
      {} as never,
      {} as never,
      dice as never,
    );

    const result = await service.processEndOfTurn(target, async () => ({
      modifier: 3,
      advantage: false,
      disadvantage: false,
    }));

    expect(dice.roll).toHaveBeenCalledWith(20);
    expect(target.conditions).not.toContain("frightened");
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "end_of_turn_save_rolled",
        data: expect.objectContaining({ passed: true }),
      }),
    );
  });
});
