import { EffectInstanceService } from "./effect-instance.service";

function makeParticipant(overrides: Record<string, unknown> = {}): any {
  return {
    id: "ranger-1",
    encounterId: "encounter-1",
    type: "pc",
    displayName: "Hunter",
    currentHp: 40,
    maxHp: 40,
    tempHp: 0,
    conditions: [],
    effectInstances: [],
    appliedEffects: [],
    ...overrides,
  };
}

describe("EffectInstanceService — Ranger Hunter turn-bound effects", () => {
  it("persists Multiattack Defense across reload and expires at the triggering turn participant's end", async () => {
    let stored = makeParticipant();
    const participants = {
      save: jest.fn(async (participant: any) => {
        stored = structuredClone(participant);
        return participant;
      }),
      find: jest.fn(async () => [structuredClone(stored)]),
      findOne: jest.fn(async () => null),
    };
    const service = new EffectInstanceService(participants as any, {} as any);

    const applied = await service.addEffect(stored, {
      kind: "ac_bonus",
      sourceFeatureSlug: "multiattack-defense",
      sourceCasterParticipantId: "attacker-1",
      payload: {
        amount: 4,
        attackerParticipantId: "attacker-1",
        turnParticipantIdAtTrigger: "turn-owner-1",
      },
      expiresAt: { kind: "participant_turn_ends", value: 1 },
      expiresAtTurnEndParticipantId: "turn-owner-1",
      requiresConcentration: false,
    });

    expect(applied.applied).toBe(true);
    expect(stored.effectInstances).toEqual([
      expect.objectContaining({
        kind: "ac_bonus",
        sourceFeatureSlug: "multiattack-defense",
        sourceCasterParticipantId: "attacker-1",
        payload: {
          amount: 4,
          attackerParticipantId: "attacker-1",
          turnParticipantIdAtTrigger: "turn-owner-1",
        },
        expiresAt: { kind: "participant_turn_ends", value: 1 },
        expiresAtTurnEndParticipantId: "turn-owner-1",
      }),
    ]);

    stored = structuredClone(stored);
    const sourceCasterTurn = await service.tickAtEndOfCasterTurn(
      "encounter-1",
      "attacker-1",
    );
    expect(sourceCasterTurn.expired).toEqual([]);
    expect(stored.effectInstances).toHaveLength(1);

    const unrelatedTurn = await service.expireAtParticipantTurnEnd(
      "encounter-1",
      "turn-owner-2",
    );
    expect(unrelatedTurn.expired).toEqual([]);
    expect(stored.effectInstances).toHaveLength(1);

    const triggeringTurn = await service.expireAtParticipantTurnEnd(
      "encounter-1",
      "turn-owner-1",
    );
    expect(triggeringTurn.expired).toEqual([applied.effect.id]);
    expect(stored.effectInstances).toEqual([]);
    expect(triggeringTurn.events).toEqual([
      expect.objectContaining({
        event_type: "effect_expired",
        target_participant_id: "ranger-1",
        data: expect.objectContaining({
          effectId: applied.effect.id,
          reason: "duration",
          kind: "ac_bonus",
          sourceFeatureSlug: "multiattack-defense",
        }),
      }),
    ]);
  });
});
