import { SpellCastingService } from "./spell-casting.service";

function makeParticipant(
  id: string,
  effectInstances: Array<Record<string, unknown>>,
): any {
  return {
    id,
    encounterId: "encounter-1",
    type: "pc",
    displayName: id,
    effectInstances,
  };
}

function createHarness(options?: {
  roll?: number;
  total?: number;
  targetAc?: number;
  hit?: boolean;
  critical?: boolean;
  criticalMiss?: boolean;
  encounterId?: string;
  targetParticipantId?: string;
  damage?: number | null;
}) {
  const attacker = makeParticipant("attacker-1", [
    {
      id: "colossus-from-trigger",
      kind: "colossus_slayer_used_this_turn",
      sourceFeatureSlug: "colossus-slayer",
      payload: {
        targetParticipantId: "shield-caster",
        turnKey: "1:turn-owner",
      },
    },
    {
      id: "older-colossus-marker",
      kind: "colossus_slayer_used_this_turn",
      sourceFeatureSlug: "colossus-slayer",
      payload: {
        targetParticipantId: "other-target",
        turnKey: "1:turn-owner",
      },
    },
  ]);
  const target = makeParticipant("shield-caster", [
    {
      id: "multiattack-from-trigger",
      kind: "ac_bonus",
      sourceFeatureSlug: "multiattack-defense",
      payload: {
        amount: 4,
        attackerParticipantId: attacker.id,
        turnKey: "1:turn-owner",
      },
    },
    {
      id: "older-multiattack-defense",
      kind: "ac_bonus",
      sourceFeatureSlug: "multiattack-defense",
      payload: {
        amount: 4,
        attackerParticipantId: attacker.id,
        turnKey: "1:turn-owner",
      },
    },
  ]);
  const participants = new Map([
    [attacker.id, attacker],
    [target.id, target],
  ]);
  const trigger = {
    id: "attack-event-1",
    encounterId: options?.encounterId ?? "encounter-1",
    sequence: 10,
    eventType: "attack_roll",
    actorParticipantId: attacker.id,
    targetParticipantId: options?.targetParticipantId ?? target.id,
    data: {
      roll: options?.roll ?? 15,
      total: options?.total ?? 15,
      targetAc: options?.targetAc ?? 14,
      hit: options?.hit ?? true,
      critical: options?.critical ?? false,
      criticalMiss: options?.criticalMiss ?? false,
      attackBoundEffectRefs: [
        {
          participantId: attacker.id,
          effectId: "colossus-from-trigger",
          sourceFeatureSlug: "colossus-slayer",
        },
        {
          participantId: target.id,
          effectId: "multiattack-from-trigger",
          sourceFeatureSlug: "multiattack-defense",
        },
      ],
    },
  };
  const damageEvent =
    options?.damage === null
      ? null
      : {
          data: {
            finalDamage: options?.damage ?? 12,
          },
        };
  const queryBuilder: any = {};
  Object.assign(queryBuilder, {
    where: jest.fn(() => queryBuilder),
    andWhere: jest.fn(() => queryBuilder),
    orderBy: jest.fn(() => queryBuilder),
    limit: jest.fn(() => queryBuilder),
    getOne: jest.fn(async () => damageEvent),
  });
  const participantRepo = {
    findOne: jest.fn(
      async ({ where }: { where: { id: string; encounterId: string } }) => {
        const participant = participants.get(where.id);
        return participant?.encounterId === where.encounterId
          ? participant
          : null;
      },
    ),
  };
  const gameEventRepo = {
    findOne: jest.fn(async () => trigger),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const effectInstanceService = {
    removeEffect: jest.fn(
      async (participant: any, effectId: string, reason: string) => {
        const removed = participant.effectInstances.find(
          (effect: any) => effect.id === effectId,
        );
        participant.effectInstances = participant.effectInstances.filter(
          (effect: any) => effect.id !== effectId,
        );
        return {
          removed: Boolean(removed),
          events: removed
            ? [
                {
                  event_type: "effect_expired",
                  target_participant_id: participant.id,
                  data: {
                    effectId,
                    reason,
                    kind: removed.kind,
                    sourceFeatureSlug: removed.sourceFeatureSlug,
                  },
                },
              ]
            : [],
        };
      },
    ),
  };
  const combatService = {
    applyHealing: jest.fn(async () => ({ ok: true })),
  };
  const service = Object.create(
    SpellCastingService.prototype,
  ) as SpellCastingService;
  Object.assign(service as any, {
    participantRepo,
    gameEventRepo,
    effectInstanceService,
    combatService,
  });

  return {
    attacker,
    target,
    trigger,
    queryBuilder,
    participantRepo,
    gameEventRepo,
    effectInstanceService,
    combatService,
    service,
  };
}

describe("SpellCastingService — Shield invalidates Hunter attack effects", () => {
  it("removes only effects created by the invalidated hit and reverts its damage", async () => {
    const harness = createHarness({
      critical: true,
    });

    const result = await (harness.service as any).recomputeShieldTrigger(
      "encounter-1",
      harness.trigger.id,
      harness.target.id,
      "owner-1",
    );

    expect(result).toEqual(
      expect.objectContaining({
        previousHit: true,
        newHit: false,
        damageReverted: 12,
        attackBoundEffectsReverted: [
          "colossus-from-trigger",
          "multiattack-from-trigger",
        ],
      }),
    );
    expect(harness.attacker.effectInstances).toEqual([
      expect.objectContaining({ id: "older-colossus-marker" }),
    ]);
    expect(harness.target.effectInstances).toEqual([
      expect.objectContaining({
        id: "older-multiattack-defense",
      }),
    ]);
    expect(harness.effectInstanceService.removeEffect).toHaveBeenNthCalledWith(
      1,
      harness.attacker,
      "colossus-from-trigger",
      "trigger_invalidated",
    );
    expect(harness.effectInstanceService.removeEffect).toHaveBeenNthCalledWith(
      2,
      harness.target,
      "multiattack-from-trigger",
      "trigger_invalidated",
    );
    expect(harness.combatService.applyHealing).toHaveBeenCalledWith(
      "encounter-1",
      {
        targetParticipantId: harness.target.id,
        amount: 12,
        ownerUserId: "owner-1",
      },
    );
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "shield_retroactive_review",
          data: expect.objectContaining({ newHit: false }),
        }),
        expect.objectContaining({
          event_type: "shield_damage_reverted",
          data: {
            amount: 12,
            triggerEventId: harness.trigger.id,
          },
        }),
      ]),
    );
  });

  it("preserves damage and effects when the raised AC still does not stop the hit", async () => {
    const harness = createHarness({ total: 23 });

    const result = await (harness.service as any).recomputeShieldTrigger(
      "encounter-1",
      harness.trigger.id,
      harness.target.id,
      "owner-1",
    );

    expect(result).toEqual(
      expect.objectContaining({
        previousHit: true,
        newHit: true,
        damageReverted: 0,
        attackBoundEffectsReverted: [],
      }),
    );
    expect(harness.effectInstanceService.removeEffect).not.toHaveBeenCalled();
    expect(harness.gameEventRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(harness.combatService.applyHealing).not.toHaveBeenCalled();
  });

  it("keeps a natural 20 as a hit after Shield", async () => {
    const harness = createHarness({
      roll: 20,
      total: 18,
      critical: true,
    });

    const result = await (harness.service as any).recomputeShieldTrigger(
      "encounter-1",
      harness.trigger.id,
      harness.target.id,
      "owner-1",
    );

    expect(result).toEqual(
      expect.objectContaining({
        previousHit: true,
        newHit: true,
        damageReverted: 0,
        attackBoundEffectsReverted: [],
      }),
    );
    expect(harness.effectInstanceService.removeEffect).not.toHaveBeenCalled();
    expect(harness.combatService.applyHealing).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "another encounter",
      options: { encounterId: "encounter-2" },
    },
    {
      name: "another target",
      options: { targetParticipantId: "other-target" },
    },
  ])("rejects an attack trigger from $name", async ({ options }) => {
    const harness = createHarness(options);

    const result = await (harness.service as any).recomputeShieldTrigger(
      "encounter-1",
      harness.trigger.id,
      harness.target.id,
      "owner-1",
    );

    expect(result).toBeNull();
    expect(harness.effectInstanceService.removeEffect).not.toHaveBeenCalled();
    expect(harness.combatService.applyHealing).not.toHaveBeenCalled();
  });
});
