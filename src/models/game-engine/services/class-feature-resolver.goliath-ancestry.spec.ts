import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Giant Ancestry", () => {
  function setup() {
    const source = {
      id: "goliath-1",
      characterId: "character-1",
      encounterId: "encounter-1",
      type: "pc",
      positionX: 5,
      positionY: 5,
      currentHp: 70,
      isDefeated: false,
      dyingState: "none",
      effectInstances: [] as Array<Record<string, any>>,
    };
    const target = {
      id: "ogre-1",
      encounterId: "encounter-1",
      type: "monster",
      positionX: 6,
      positionY: 5,
      currentHp: 50,
      maxHp: 50,
      isDefeated: false,
      conditions: [] as string[],
      conditionInstances: [],
      effectInstances: [] as Array<Record<string, any>>,
      monster: {
        size: "Large",
        damage_immunities: [],
        damage_resistances: [],
        damage_vulnerabilities: [],
      },
    };
    const participants = {
      findOne: jest.fn(async ({ where: { id } }: any) =>
        id === source.id ? source : id === target.id ? target : null,
      ),
      find: jest.fn(async () => [source, target]),
      save: jest.fn(async (participant: any) => participant),
    };
    const state = {
      character_id: source.characterId,
      current_hp: 70,
      temp_hp: 0,
      death_saves_success: 0,
      death_saves_fail: 0,
    };
    const charStates = {
      findOne: jest.fn().mockResolvedValue(state),
      save: jest.fn(async (value: any) => value),
    };
    const conditionLifecycle = {
      applyCondition: jest.fn(async (participant: any, input: any) => {
        participant.conditions = [...participant.conditions, input.slug];
        return {
          instance: { id: `condition-${input.slug}` },
          events: [{ event_type: "condition_applied", data: input }],
        };
      }),
      removeConditionsEndedByDamage: jest.fn().mockResolvedValue([]),
    };
    let effectSequence = 0;
    const effectInstances = {
      addEffect: jest.fn(async (participant: any, input: any) => {
        const effect = { id: `effect-${++effectSequence}`, ...input };
        participant.effectInstances = [
          ...(participant.effectInstances ?? []),
          effect,
        ];
        return {
          effect,
          events: [{ event_type: "effect_applied", data: input }],
        };
      }),
    };
    const dice = { roll: jest.fn() };
    const service = new ClassFeatureResolverService(
      participants as never,
      charStates as never,
      conditionLifecycle as never,
      effectInstances as never,
      dice as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const armHit = (featureSlug: string) => {
      source.effectInstances = [
        {
          id: "pending-hit",
          kind: "giant_ancestry_hit_pending",
          sourceFeatureSlug: featureSlug,
          payload: { requiredTargetId: target.id },
        },
      ];
    };
    const armReaction = (
      featureSlug: "stones-endurance" | "storms-thunder",
    ) => {
      source.effectInstances = [
        {
          id: "pending-reaction",
          kind: "giant_ancestry_reaction_pending",
          sourceFeatureSlug: featureSlug,
          payload: {
            triggerEventId: "damage-event-1",
            attackerParticipantId: target.id,
            incomingDamage: 10,
            damageType: "slashing",
            hpBefore: 80,
            hpAfter: 70,
          },
        },
      ];
    };
    return {
      service,
      source,
      target,
      state,
      participants,
      conditionLifecycle,
      effectInstances,
      dice,
      armHit,
      armReaction,
    };
  }

  it("teleporta até 30 pés sem gastar movimento", async () => {
    const { service, source } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "clouds-jaunt",
      options: { destinationX: 10, destinationY: 5 },
    });

    expect(result.resolved).toBe(true);
    expect({ x: source.positionX, y: source.positionY }).toEqual({
      x: 10,
      y: 5,
    });
    expect(result.resolutionPayload).toMatchObject({
      distanceFt: 25,
      movementSpent: 0,
    });
  });

  it("respeita as dimensões reais do mapa ao validar o teleporte", async () => {
    const { service, source } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "clouds-jaunt",
      options: {
        destinationX: 8,
        destinationY: 5,
        gridColumns: 8,
        gridRows: 12,
      },
    });

    expect(result.resolved).toBe(false);
    expect({ x: source.positionX, y: source.positionY }).toEqual({
      x: 5,
      y: 5,
    });
  });

  it("aplica 1d10 de fogo após um acerto confirmado", async () => {
    const { service, source, target, dice, armHit } = setup();
    armHit("fires-burn");
    dice.roll.mockReturnValue(8);

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "fires-burn",
      targets: [target.id],
    });

    expect(result.resolved).toBe(true);
    expect(target.currentHp).toBe(42);
    expect(result.resolutionPayload).toMatchObject({
      roll: 8,
      finalDamage: 8,
      damageType: "fire",
    });
  });

  it("aplica frio e redução de velocidade até o próximo turno do Goliath", async () => {
    const { service, source, target, dice, armHit, effectInstances } = setup();
    armHit("frosts-chill");
    dice.roll.mockReturnValue(5);

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "frosts-chill",
      targets: [target.id],
    });

    expect(result.resolved).toBe(true);
    expect(target.currentHp).toBe(45);
    expect(effectInstances.addEffect).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        kind: "speed_reduction",
        payload: { amount: 10 },
        expiresAt: { kind: "until_caster_turn", value: 1 },
      }),
    );
  });

  it("derruba criatura Grande ou menor sem salvaguarda", async () => {
    const { service, source, target, armHit, conditionLifecycle } = setup();
    armHit("hills-tumble");

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "hills-tumble",
      targets: [target.id],
    });

    expect(result.resolved).toBe(true);
    expect(conditionLifecycle.applyCondition).toHaveBeenCalledWith(
      target,
      expect.objectContaining({ slug: "prone" }),
    );
    expect(target.conditions).toContain("prone");
  });

  it("reduz o dano recebido em 1d12 + CON e reconcilia os PV", async () => {
    const { service, source, state, dice, armReaction } = setup();
    armReaction("stones-endurance");
    dice.roll.mockReturnValue(6);

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "stones-endurance",
      options: { triggerEventId: "damage-event-1" },
      caster: { abilityMods: { con: 3 } },
    });

    expect(result.resolved).toBe(true);
    expect(result.resolutionPayload).toMatchObject({
      reductionRoll: 6,
      reductionTotal: 9,
      damagePrevented: 9,
      damageAfter: 1,
      hpAfter: 79,
    });
    expect(state.current_hp).toBe(79);
    expect(source.currentHp).toBe(79);
  });

  it("recalcula PV temporários antes dos PV reais ao reduzir o dano", async () => {
    const { service, source, state, dice, armReaction } = setup();
    armReaction("stones-endurance");
    source.effectInstances[0].payload = {
      ...source.effectInstances[0].payload,
      incomingDamage: 32,
      hpBefore: 114,
      hpAfter: 86,
      tempHpBefore: 4,
    };
    source.currentHp = 86;
    source.tempHp = 0;
    state.current_hp = 86;
    state.temp_hp = 0;
    dice.roll.mockReturnValue(7);

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "stones-endurance",
      options: { triggerEventId: "damage-event-1" },
      caster: { abilityMods: { con: 3 } },
    });

    expect(result.resolved).toBe(true);
    expect(result.resolutionPayload).toMatchObject({
      reductionTotal: 10,
      damageAfter: 22,
      tempHpBefore: 4,
      tempHpAfter: 0,
      hpAfter: 96,
    });
    expect(state).toMatchObject({ current_hp: 96, temp_hp: 0 });
    expect(source).toMatchObject({ currentHp: 96, tempHp: 0 });
  });

  it("revida em agressor a até 60 pés com 1d8 trovejante", async () => {
    const { service, source, target, dice, armReaction } = setup();
    armReaction("storms-thunder");
    dice.roll.mockReturnValue(7);

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "storms-thunder",
      options: { triggerEventId: "damage-event-1" },
    });

    expect(result.resolved).toBe(true);
    expect(target.currentHp).toBe(43);
    expect(result.resolutionPayload).toMatchObject({
      roll: 7,
      finalDamage: 7,
      damageType: "thunder",
      distanceFt: 5,
    });
  });
});
