import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Rogue", () => {
  const rogue = {
    id: "rogue-1",
    type: "pc",
    characterId: "character-rogue",
    currentHp: 8,
    isDefeated: false,
    dyingState: "none",
    movementRemaining: 30,
    conditions: [],
    effectInstances: [],
  } as any;
  const target = {
    id: "target-1",
    type: "monster",
    currentHp: 30,
    maxHp: 40,
    isDefeated: false,
    dyingState: "none",
    conditions: [],
    conditionInstances: [],
    monster: { size: "Large", constitution: 10, dexterity: 10 },
  } as any;
  const rogueState = {
    character_id: "character-rogue",
    current_hp: 8,
    death_saves_success: 0,
    death_saves_fail: 0,
  } as any;
  const participants = {
    findOne: jest.fn(async ({ where: { id } }: any) =>
      id === rogue.id ? rogue : target,
    ),
    save: jest.fn(async (participant: any) => participant),
  };
  const charStates = {
    findOne: jest.fn(async ({ where: { character_id } }: any) =>
      character_id === rogueState.character_id ? rogueState : null,
    ),
    save: jest.fn(async (state: any) => state),
  };
  const conditions = {
    applyCondition: jest.fn(async (participant: any, input: any) => {
      participant.conditions = [
        ...(participant.conditions ?? []),
        input.slug,
      ];
      return { events: [{ event_type: "condition_applied", data: input }] };
    }),
  };
  const effects = {
    addEffect: jest.fn(async () => ({ events: [] })),
  };
  const dice = { roll: jest.fn() };

  const makeService = () =>
    new ClassFeatureResolverService(
      participants as never,
      charStates as never,
      conditions as never,
      effects as never,
      dice as never,
      {} as never,
      {} as never,
      {} as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    rogue.currentHp = 8;
    rogue.dyingState = "none";
    rogue.isDefeated = false;
    rogue.movementRemaining = 30;
    rogue.conditions = [];
    rogue.effectInstances = [];
    rogueState.current_hp = 8;
    target.currentHp = 30;
    target.isDefeated = false;
    target.conditions = [];
  });

  it("halves the triggering attack damage and restores the matching HP", async () => {
    rogue.effectInstances = [
      {
        id: "uncanny-pending",
        kind: "uncanny_dodge_pending",
        payload: {
          triggerEventId: "damage-1",
          incomingDamage: 9,
          hpBefore: 12,
          hpAfter: 3,
          damageType: "slashing",
        },
      },
    ];

    const result = await makeService().resolveInvocation(rogue.id, {
      featureSlug: "uncanny-dodge",
      options: { triggerEventId: "damage-1" },
    });

    expect(result.resolutionPayload).toMatchObject({
      incomingDamage: 9,
      damagePrevented: 5,
      damageAfter: 4,
      hpAfter: 8,
    });
    expect(rogueState.current_hp).toBe(8);
    expect(rogue.effectInstances).toEqual([]);
  });

  it("trades one Sneak Attack die for Trip and applies Prone on a failed save", async () => {
    rogue.effectInstances = [
      {
        id: "cunning-pending",
        kind: "cunning_strike_pending",
        payload: {
          requiredTargetId: target.id,
          sneakAttackRolls: [2, 4, 6, 3, 5],
          sneakAttackDice: "5d6",
          sneakAttackCritical: false,
          targetHpAfterAttack: 30,
          cunningStrikeOptions: ["poison", "trip", "withdraw"],
        },
      },
    ];
    dice.roll.mockReturnValueOnce(4);

    const result = await makeService().resolveInvocation(rogue.id, {
      featureSlug: "cunning-strike",
      targets: [target.id],
      options: { targetParticipantId: target.id, choice: "trip" },
      saveDc: 17,
      caster: { speed: 30 },
    });

    expect(result.resolutionPayload).toMatchObject({
      choice: "trip",
      damageForgone: 5,
      targetHpAfter: 35,
      saved: false,
      applied: true,
    });
    expect(target.conditions).toContain("prone");
    expect(target.currentHp).toBe(35);
    expect(rogue.effectInstances).toEqual([]);
  });

  it("reports Trip as blocked instead of applied when the target is immune", async () => {
    rogue.effectInstances = [
      {
        id: "cunning-pending-immune",
        kind: "cunning_strike_pending",
        payload: {
          requiredTargetId: target.id,
          sneakAttackRolls: [2, 4, 6, 3, 5],
          sneakAttackDice: "5d6",
          targetHpAfterAttack: 30,
          cunningStrikeOptions: ["trip"],
        },
      },
    ];
    dice.roll.mockReturnValueOnce(4);
    conditions.applyCondition.mockResolvedValueOnce({
      events: [{ event_type: "condition_blocked_by_immunity" }],
    });

    const result = await makeService().resolveInvocation(rogue.id, {
      featureSlug: "cunning-strike",
      targets: [target.id],
      options: { targetParticipantId: target.id, choice: "trip" },
      saveDc: 17,
      caster: { speed: 30 },
    });

    expect(result.resolutionPayload).toMatchObject({
      choice: "trip",
      saved: false,
      applied: false,
      blockedByImmunity: true,
    });
    expect(target.conditions).not.toContain("prone");
  });

  it("Withdraw grants half speed and prevents opportunity attacks", async () => {
    rogue.effectInstances = [
      {
        id: "cunning-pending",
        kind: "cunning_strike_pending",
        payload: {
          requiredTargetId: target.id,
          sneakAttackRolls: [2, 4, 6, 3, 5],
          sneakAttackDice: "5d6",
          targetHpAfterAttack: 30,
          cunningStrikeOptions: ["withdraw"],
        },
      },
    ];

    const result = await makeService().resolveInvocation(rogue.id, {
      featureSlug: "cunning-strike",
      targets: [target.id],
      options: { targetParticipantId: target.id, choice: "withdraw" },
      saveDc: 17,
      caster: { speed: 30 },
    });

    expect(result.resolutionPayload).toMatchObject({
      choice: "withdraw",
      damageForgone: 5,
      applied: true,
    });
    expect(rogue.movementRemaining).toBe(45);
    expect(rogue.hasDisengaged).toBe(true);
  });
});
