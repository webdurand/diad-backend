import { ConditionEffectsService } from "./condition-effects.service";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { ConditionLifecycleService } from "./condition-lifecycle.service";

describe("Ash Puff condition rules", () => {
  const service = new ConditionEffectsService();

  it("imposes disadvantage on attacks, every save, and ability checks", () => {
    expect(service.getAttackModifiers(["ash_puff"]).hasDisadvantage).toBe(true);
    for (const ability of ["str", "dex", "con", "int", "wis", "cha"]) {
      expect(
        service.getSavingThrowModifiers(["ash_puff"], ability).hasDisadvantage,
      ).toBe(true);
    }
    expect(service.getAbilityCheckModifiers(["ash_puff"]).hasDisadvantage).toBe(
      true,
    );
  });

  it("describes the three affected d20 test categories", () => {
    expect(service.getConditionSummary(["ash_puff"])).toContain(
      "Ash Puff: Disadvantage on attack rolls, saving throws, and ability checks.",
    );
  });
});

describe("Ash Puff condition lifecycle", () => {
  function target(): EncounterParticipantEntity {
    return {
      id: "fighter",
      displayName: "Fighter",
      conditions: ["ash_puff"],
      conditionInstances: [
        {
          id: "ash-puff-condition",
          slug: "ash_puff",
          appliedBy: "ash-zombie",
          sourceSpell: null,
          sourceConcentration: false,
          source: "ability:ash-puff",
          saveAbility: "con",
          saveDc: 10,
          repeatSaveTiming: "end_of_turn",
          durationRoundsRemaining: 10,
          appliedAt: "2026-07-26T00:00:00.000Z",
        },
      ],
    } as EncounterParticipantEntity;
  }

  it("persists a failed disadvantaged end-of-turn save and decrements 10 to 9 rounds", async () => {
    const subject = target();
    const participants = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    const dice = {
      roll: jest.fn(),
      rollWithDisadvantage: jest.fn().mockReturnValue({
        roll1: 13,
        roll2: 1,
        chosen: 1,
        discarded: 13,
      }),
    };
    const service = new ConditionLifecycleService(
      participants as never,
      {} as never,
      {} as never,
      dice as never,
    );

    const result = await service.processEndOfTurn(subject, async () => ({
      modifier: 4,
      advantage: false,
      disadvantage: true,
    }));

    expect(dice.rollWithDisadvantage).toHaveBeenCalledTimes(1);
    expect(subject.conditions).toContain("ash_puff");
    expect(subject.conditionInstances[0].durationRoundsRemaining).toBe(9);
    expect(participants.save).toHaveBeenCalledWith(subject);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "end_of_turn_save_rolled",
        data: expect.objectContaining({
          slug: "ash_puff",
          rolled: 1,
          modifier: 4,
          total: 5,
          passed: false,
          advantage: {
            roll1: 13,
            roll2: 1,
            chosen: 1,
            discarded: 13,
          },
          hasAdvantage: false,
          hasDisadvantage: true,
          advantageCancelled: false,
        }),
      }),
    );
  });

  it("records cancellation and rolls one d20 when advantage and disadvantage coexist", async () => {
    const subject = target();
    const participants = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    const dice = {
      roll: jest.fn().mockReturnValue(11),
      rollWithAdvantage: jest.fn(),
      rollWithDisadvantage: jest.fn(),
    };
    const service = new ConditionLifecycleService(
      participants as never,
      {} as never,
      {} as never,
      dice as never,
    );

    const result = await service.processEndOfTurn(subject, async () => ({
      modifier: 0,
      advantage: true,
      disadvantage: true,
    }));

    expect(dice.roll).toHaveBeenCalledWith(20);
    expect(dice.rollWithAdvantage).not.toHaveBeenCalled();
    expect(dice.rollWithDisadvantage).not.toHaveBeenCalled();
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "end_of_turn_save_rolled",
        data: expect.objectContaining({
          rolled: 11,
          advantage: undefined,
          hasAdvantage: false,
          hasDisadvantage: false,
          advantageCancelled: true,
        }),
      }),
    );
  });

  it("removes the persisted effect after a successful repeat save", async () => {
    const subject = target();
    const participants = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    const service = new ConditionLifecycleService(
      participants as never,
      {} as never,
      {} as never,
      {
        roll: jest.fn().mockReturnValue(15),
      } as never,
    );

    const result = await service.processEndOfTurn(subject, async () => ({
      modifier: 4,
      advantage: false,
      disadvantage: false,
    }));

    expect(subject.conditions).not.toContain("ash_puff");
    expect(subject.conditionInstances).toHaveLength(0);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "condition_removed",
        data: expect.objectContaining({
          slug: "ash_puff",
          reason: "target_saved",
        }),
      }),
    );
  });
});
