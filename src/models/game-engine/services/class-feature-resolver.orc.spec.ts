import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Orc (2024)", () => {
  function setup(options?: {
    tempHp?: number;
    movementRemaining?: number;
    dying?: boolean;
  }) {
    const triggerEventId = "relentless-trigger-1";
    const orc: any = {
      id: "orc-1",
      characterId: "char-orc-1",
      displayName: "Ghor",
      currentHp: options?.dying ? 0 : 20,
      tempHp: options?.tempHp ?? 1,
      movementRemaining: options?.movementRemaining ?? 15,
      hasDashed: false,
      dyingState: options?.dying ? "dying" : "none",
      isDefeated: false,
      conditions: options?.dying ? ["dying", "unconscious"] : [],
      conditionInstances: options?.dying
        ? [{ id: "condition-dying", slug: "dying" }]
        : [],
      effectInstances: options?.dying
        ? [
            {
              id: "relentless-pending-1",
              kind: "relentless_endurance_pending",
              sourceFeatureSlug: "relentless-endurance",
              sourceCasterParticipantId: "orc-1",
              payload: {
                triggerEventId,
                hpBefore: 8,
                hpAfter: 0,
                incomingDamage: 10,
              },
              expiresAt: { kind: "until_consumed" },
              requiresConcentration: false,
            },
          ]
        : [],
    };
    const state: any = {
      character_id: orc.characterId,
      current_hp: options?.dying ? 0 : 20,
      temp_hp: options?.tempHp ?? 1,
      death_saves_success: options?.dying ? 1 : 0,
      death_saves_fail: options?.dying ? 1 : 0,
      conditions: options?.dying ? ["dying", "unconscious"] : [],
    };
    const participants = {
      findOne: jest.fn().mockResolvedValue(orc),
      save: jest.fn(async (value: any) => value),
    };
    const charStates = {
      findOne: jest.fn().mockResolvedValue(state),
      save: jest.fn(async (value: any) => value),
    };
    const effectInstances = {
      removeEffect: jest.fn(
        async (target: any, effectId: string, reason: string) => {
          target.effectInstances = (target.effectInstances ?? []).filter(
            (effect: any) => effect.id !== effectId,
          );
          return {
            removed: true,
            events: [
              {
                event_type: "effect_removed",
                target_participant_id: target.id,
                data: { effectId, reason },
              },
            ],
          };
        },
      ),
    };
    const service = new ClassFeatureResolverService(
      participants as never,
      charStates as never,
      {} as never,
      effectInstances as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return {
      triggerEventId,
      orc,
      state,
      participants,
      charStates,
      effectInstances,
      service,
    };
  }

  it("uses Dash as a bonus action and grants PB temporary HP", async () => {
    const { orc, state, participants, charStates, service } = setup();

    const result = await service.resolveInvocation(orc.id, {
      featureSlug: "adrenaline-rush",
      caster: { speed: 30, profBonus: 4 },
    });

    expect(result.resolved).toBe(true);
    expect(orc.hasDashed).toBe(true);
    expect(orc.movementRemaining).toBe(45);
    expect(orc.tempHp).toBe(4);
    expect(state.temp_hp).toBe(4);
    expect(result.resolutionPayload).toMatchObject({
      movementBefore: 15,
      movementAfter: 45,
      tempHpBefore: 1,
      tempHpAfter: 4,
      resourceConsumed: true,
    });
    expect(participants.save).toHaveBeenCalledWith(orc);
    expect(charStates.save).toHaveBeenCalledWith(state);
  });

  it("does not replace a larger existing temporary-HP pool", async () => {
    const { orc, state, service } = setup({ tempHp: 6 });

    const result = await service.resolveInvocation(orc.id, {
      featureSlug: "adrenaline-rush",
      caster: { speed: 30, profBonus: 4 },
    });

    expect(result.resolved).toBe(true);
    expect(orc.tempHp).toBe(6);
    expect(state.temp_hp).toBe(6);
    expect(result.resolutionPayload?.tempHpAfter).toBe(6);
  });

  it("adds zero movement when grappled reduces the Orc's current Speed to zero", async () => {
    const { orc, state, service } = setup();
    orc.conditions = ["grappled"];

    const result = await service.resolveInvocation(orc.id, {
      featureSlug: "adrenaline-rush",
      caster: { speed: 30, profBonus: 4 },
    });

    expect(result.resolved).toBe(true);
    expect(orc.hasDashed).toBe(true);
    expect(orc.movementRemaining).toBe(15);
    expect(orc.tempHp).toBe(4);
    expect(state.temp_hp).toBe(4);
    expect(result.resolutionPayload).toMatchObject({
      speed: 0,
      movementBefore: 15,
      movementAfter: 15,
    });
  });

  it("accepts the persisted opportunity, restores 1 HP, and clears dying", async () => {
    const {
      triggerEventId,
      orc,
      state,
      effectInstances,
      service,
    } = setup({ dying: true });

    const result = await service.resolveInvocation(orc.id, {
      featureSlug: "relentless-endurance",
      options: { triggerEventId },
    });

    expect(result.resolved).toBe(true);
    expect(result.resolutionPayload).toMatchObject({
      hpBefore: 0,
      hpAfter: 1,
      resourceConsumed: true,
    });
    expect(state).toMatchObject({
      current_hp: 1,
      death_saves_success: 0,
      death_saves_fail: 0,
      conditions: [],
    });
    expect(orc).toMatchObject({
      currentHp: 1,
      dyingState: "none",
      isDefeated: false,
      conditions: [],
      conditionInstances: [],
      effectInstances: [],
    });
    expect(effectInstances.removeEffect).toHaveBeenCalledWith(
      orc,
      "relentless-pending-1",
      "consumed",
    );
    expect(
      result.events.some(
        (event) =>
          event.event_type === "class_feature_triggered" &&
          event.data?.featureSlug === "relentless-endurance",
      ),
    ).toBe(true);
  });

  it("clears a stale opportunity instead of accepting after the Orc died", async () => {
    const { triggerEventId, orc, state, effectInstances, service } = setup({
      dying: true,
    });
    orc.dyingState = "dead";
    orc.isDefeated = true;

    const result = await service.resolveInvocation(orc.id, {
      featureSlug: "relentless-endurance",
      options: { triggerEventId },
    });

    expect(result.resolved).toBe(false);
    expect(result.resolutionPayload).toMatchObject({
      resourceConsumed: false,
    });
    expect(state.current_hp).toBe(0);
    expect(orc).toMatchObject({
      currentHp: 0,
      dyingState: "dead",
      isDefeated: true,
      effectInstances: [],
    });
    expect(effectInstances.removeEffect).toHaveBeenCalledWith(
      orc,
      "relentless-pending-1",
      "manual",
    );
  });

  it("clears a stale opportunity instead of overwriting healing", async () => {
    const { triggerEventId, orc, state, service } = setup({ dying: true });
    state.current_hp = 6;
    orc.currentHp = 6;
    orc.dyingState = "none";
    orc.conditions = [];
    orc.conditionInstances = [];

    const result = await service.resolveInvocation(orc.id, {
      featureSlug: "relentless-endurance",
      options: { triggerEventId },
    });

    expect(result.resolved).toBe(false);
    expect(state.current_hp).toBe(6);
    expect(orc).toMatchObject({
      currentHp: 6,
      dyingState: "none",
      isDefeated: false,
      effectInstances: [],
    });
  });
});
