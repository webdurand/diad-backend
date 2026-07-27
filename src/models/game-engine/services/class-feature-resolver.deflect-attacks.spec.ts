import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Deflect Attacks", () => {
  const source = {
    id: "monk-1",
    encounterId: "encounter-1",
    type: "pc",
    characterId: "character-monk",
    currentHp: 2,
    isDefeated: false,
    dyingState: "none",
    positionX: 10,
    positionY: 10,
    effectInstances: [],
  } as any;
  const attacker = {
    id: "attacker-1",
    encounterId: "encounter-1",
    type: "monster",
    currentHp: 30,
    isDefeated: false,
    positionX: 10,
    positionY: 9,
    monster: { dexterity: 10 },
  } as any;
  const monkState = {
    character_id: "character-monk",
    current_hp: 2,
    death_saves_success: 0,
    death_saves_fail: 0,
    ki_points_used: 0,
  } as any;
  const participants = {
    findOne: jest.fn(async ({ where: { id } }: any) =>
      id === source.id ? source : attacker,
    ),
    save: jest.fn(async (participant: any) => participant),
  };
  const charStates = {
    findOne: jest.fn(async ({ where: { character_id } }: any) =>
      character_id === monkState.character_id ? monkState : null,
    ),
    save: jest.fn(async (state: any) => state),
  };
  const dice = { roll: jest.fn() };
  const effects = {
    removeEffect: jest.fn(async (participant: any, effectId: string) => {
      participant.effectInstances = (participant.effectInstances ?? []).filter(
        (effect: any) => effect.id !== effectId,
      );
      return {
        removed: true,
        events: [{ event_type: "effect_removed", data: { effectId } }],
      };
    }),
  };

  const makeService = () =>
    new ClassFeatureResolverService(
      participants as never,
      charStates as never,
      {} as never,
      effects as never,
      dice as never,
      {} as never,
      {} as never,
      {} as never,
    );

  const arm = (
    incomingDamage: number,
    includeRelentlessEndurance = false,
  ) => {
    source.effectInstances = [
      {
        id: "pending-deflect",
        kind: "deflect_attacks_pending",
        payload: {
          triggerEventId: "damage-event-1",
          attackerParticipantId: attacker.id,
          incomingDamage,
          damageType: "bludgeoning",
          hpBefore: 20,
          hpAfter: Math.max(0, 20 - incomingDamage),
          isMeleeAttack: true,
        },
      },
      ...(includeRelentlessEndurance
        ? [
            {
              id: "pending-relentless",
              kind: "relentless_endurance_pending",
              payload: { triggerEventId: "relentless-trigger" },
            },
          ]
        : []),
    ];
  };

  beforeEach(() => {
    jest.clearAllMocks();
    source.currentHp = 2;
    source.isDefeated = false;
    source.dyingState = "none";
    attacker.currentHp = 30;
    attacker.isDefeated = false;
    monkState.current_hp = 2;
    monkState.ki_points_used = 0;
  });

  it("reconstructs HP from the pre-attack value after a partial reduction", async () => {
    arm(18, true);
    dice.roll.mockReturnValueOnce(1);

    const result = await makeService().resolveInvocation(source.id, {
      featureSlug: "deflect-attacks",
      options: { triggerEventId: "damage-event-1" },
      caster: { abilityMods: { dex: 4 }, classLevel: 5 },
      saveDc: 11,
    });

    expect(result.resolutionPayload).toMatchObject({
      incomingDamage: 18,
      reductionTotal: 10,
      damagePrevented: 10,
      damageAfter: 8,
      hpAfter: 12,
      fullyDeflected: false,
    });
    expect(monkState.current_hp).toBe(12);
    expect(source.currentHp).toBe(12);
    expect(source.effectInstances).toEqual([]);
    expect(effects.removeEffect).toHaveBeenCalledWith(
      source,
      "pending-relentless",
      "manual",
    );
  });

  it("keeps Relentless Endurance pending when Deflect Attacks still leaves 0 HP", async () => {
    arm(30, true);
    dice.roll.mockReturnValueOnce(1);

    const result = await makeService().resolveInvocation(source.id, {
      featureSlug: "deflect-attacks",
      options: { triggerEventId: "damage-event-1" },
      caster: { abilityMods: { dex: 4 }, classLevel: 5 },
      saveDc: 11,
    });

    expect(result.resolutionPayload).toMatchObject({
      incomingDamage: 30,
      reductionTotal: 10,
      damageAfter: 20,
      hpAfter: 0,
    });
    expect(source.effectInstances).toEqual([
      expect.objectContaining({
        id: "pending-relentless",
        kind: "relentless_endurance_pending",
      }),
    ]);
    expect(effects.removeEffect).not.toHaveBeenCalled();
  });

  it("spends Focus and damages the attacker when the redirected save fails", async () => {
    arm(8);
    dice.roll
      .mockReturnValueOnce(5)
      .mockReturnValueOnce(4)
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(6);

    const result = await makeService().resolveInvocation(source.id, {
      featureSlug: "deflect-attacks",
      options: {
        triggerEventId: "damage-event-1",
        redirectToAttacker: true,
      },
      caster: { abilityMods: { dex: 4 }, classLevel: 5 },
      saveDc: 11,
    });

    expect(result.resolutionPayload).toMatchObject({
      fullyDeflected: true,
      redirected: true,
      redirectSaved: false,
      redirectDamage: 13,
    });
    expect(monkState.ki_points_used).toBe(1);
    expect(attacker.currentHp).toBe(17);
    expect(
      result.events.find((event) => event.event_type === "save_rolled")?.data,
    ).toMatchObject({ roll: 4, modifier: 0, total: 4, success: false });
    expect(
      result.events.find((event) => event.event_type === "damage_applied")?.data,
    ).toMatchObject({ finalDamage: 13, type: "bludgeoning" });
  });
});
