import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { ConditionLifecycleService } from "./condition-lifecycle.service";

describe("ConditionLifecycleService source-turn expiry", () => {
  it("mantém Fell Glare durante o turno do alvo e expira no fim do próximo turno do conjurador", async () => {
    const target = {
      id: "ogre-1",
      encounterId: "enc-1",
      displayName: "Ogre",
      conditions: ["frightened"],
      conditionInstances: [
        {
          id: "fell-glare-1",
          slug: "frightened",
          appliedBy: "steed-1",
          sourceSpell: null,
          sourceConcentration: false,
          source: "ability:warhorse-fell-glare",
          saveAbility: "wis",
          saveDc: 12,
          repeatSaveTiming: "never",
          durationRoundsRemaining: null,
          expiresAtTurnEndParticipantId: "paladin-1",
          appliedAt: "2026-07-25T00:00:00.000Z",
        },
      ],
    } as EncounterParticipantEntity;
    const participants = {
      find: jest.fn(async () => [target]),
      save: jest.fn(async (value) => value),
    };
    const service = new ConditionLifecycleService(
      participants as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const targetTurn = await service.expireAtParticipantTurnEnd(
      "enc-1",
      target.id,
    );
    expect(targetTurn.events).toEqual([]);
    expect(target.conditions).toContain("frightened");

    const casterTurn = await service.expireAtParticipantTurnEnd(
      "enc-1",
      "paladin-1",
    );
    expect(target.conditions).not.toContain("frightened");
    expect(target.conditionInstances).toEqual([]);
    expect(casterTurn.events).toContainEqual(
      expect.objectContaining({
        event_type: "condition_expired",
        actor_participant_id: "paladin-1",
        target_participant_id: target.id,
        data: expect.objectContaining({
          slug: "frightened",
          removalReason: "source_turn_ended",
        }),
      }),
    );
  });
});
