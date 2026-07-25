import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { ConditionLifecycleService } from "./condition-lifecycle.service";

describe("ConditionLifecycleService — Hypnotic Pattern", () => {
  it("removes the hypnotized state after any positive damage", async () => {
    const participants = {
      save: jest.fn(async (value) => value),
    };
    const service = new ConditionLifecycleService(
      participants as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const target = {
      id: "target-1",
      conditions: ["hypnotized", "prone"],
      conditionInstances: [
        {
          id: "hypnosis-1",
          slug: "hypnotized",
          sourceSpell: "hypnotic-pattern",
          source: "spell:hypnotic-pattern",
        },
        {
          id: "prone-1",
          slug: "prone",
          source: "manual",
        },
      ],
    } as EncounterParticipantEntity;

    const events = await service.removeConditionsEndedByDamage(target);

    expect(target.conditions).toEqual(["prone"]);
    expect(target.conditionInstances).toHaveLength(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        event_type: "condition_removed",
        data: expect.objectContaining({
          slug: "hypnotized",
          removalReason: "damage_received",
        }),
      }),
    );
    expect(participants.save).toHaveBeenCalledWith(target);
  });

  it("removes only Abjure Foes fear after damage", async () => {
    const participants = {
      save: jest.fn(async (value) => value),
    };
    const service = new ConditionLifecycleService(
      participants as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const target = {
      id: "target-1",
      conditions: ["frightened"],
      conditionInstances: [
        {
          id: "abjure-fear",
          slug: "frightened",
          source: "feature:abjure-foes",
        },
        {
          id: "other-fear",
          slug: "frightened",
          source: "feature:celestial-revelation",
        },
      ],
    } as EncounterParticipantEntity;

    const events = await service.removeConditionsEndedByDamage(target);

    expect(target.conditions).toEqual(["frightened"]);
    expect(target.conditionInstances).toEqual([
      expect.objectContaining({ id: "other-fear" }),
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        event_type: "condition_removed",
        data: expect.objectContaining({
          slug: "frightened",
          source: "feature:abjure-foes",
          removalReason: "damage_received",
        }),
      }),
    );
  });
});
