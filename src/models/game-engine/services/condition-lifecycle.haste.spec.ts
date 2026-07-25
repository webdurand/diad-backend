import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { ConditionLifecycleService } from "./condition-lifecycle.service";

function target(turnsRemaining: number): EncounterParticipantEntity {
  return {
    id: "target-1",
    displayName: "Target",
    conditions: ["haste_lethargy"],
    conditionInstances: [
      {
        id: "haste-lethargy-1",
        slug: "haste_lethargy",
        appliedBy: "caster-1",
        sourceSpell: "haste",
        sourceConcentration: false,
        source: "spell:haste",
        saveAbility: null,
        saveDc: null,
        repeatSaveTiming: "end_of_turn",
        durationRoundsRemaining: turnsRemaining,
        appliedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  } as EncounterParticipantEntity;
}

describe("ConditionLifecycleService Haste lethargy", () => {
  const participants = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
  };
  const service = new ConditionLifecycleService(
    participants as never,
    {} as never,
    {} as never,
    { roll: jest.fn() } as never,
  );

  it("persists through the current turn when Haste ended on that turn", async () => {
    const subject = target(2);
    await service.processEndOfTurn(subject, async () => ({
      modifier: 0,
      advantage: false,
      disadvantage: false,
    }));
    expect(subject.conditions).toContain("haste_lethargy");
    expect(subject.conditionInstances[0].durationRoundsRemaining).toBe(1);
  });

  it("expires after the target's next turn", async () => {
    const subject = target(1);
    const result = await service.processEndOfTurn(subject, async () => ({
      modifier: 0,
      advantage: false,
      disadvantage: false,
    }));
    expect(subject.conditions).not.toContain("haste_lethargy");
    expect(result.events).toContainEqual(
      expect.objectContaining({
        event_type: "condition_removed",
        data: expect.objectContaining({
          slug: "haste_lethargy",
          reason: "haste_next_turn_ended",
        }),
      }),
    );
  });
});
