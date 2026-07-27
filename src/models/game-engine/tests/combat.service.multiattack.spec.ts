import { CombatService, AttackDto } from "../services/combat.service";
import { DiceService } from "../services/dice.service";
import { ConditionEffectsService } from "../services/condition-effects.service";
import { MonsterActionResolver } from "../services/monster-action-resolver.service";



function makeParticipant(overrides: Record<string, any> = {}): any {
  return {
    id: "p-" + Math.random().toString(36).slice(2, 8),
    type: "pc",
    encounterId: "enc-1",
    displayName: "Thorin",
    tempHp: 0,
    conditions: [],
    isConcentrating: false,
    legendaryActionsUsed: 0,
    reactionsUsed: 0,
    actionUsed: false,
    bonusActionUsed: false,
    hasDashed: false,
    hasDisengaged: false,
    isVisible: true,
    isDefeated: false,
    dyingState: "none",
    faction: "ally",
    spellSlotsUsed: {},
    effectInstances: [],
    ...overrides,
  };
}

function createHarness() {
  const participants = new Map<string, any>();
  const encounter = {
    id: "enc-1",
    sessionId: "sess-1",
    status: "active",
    turnOrder: [] as string[],
    currentTurnIndex: 0,
    currentRound: 1,
  };
  const hpByChar: Record<string, { current: number; max: number }> = {};

  const encounterRepo: any = {
    findOne: jest.fn(async () => encounter),
    save: jest.fn(async (e: any) => e),
  };
  const participantRepo: any = {
    findOne: jest.fn(
      async ({ where: { id } }: any) => participants.get(id) ?? null,
    ),
    save: jest.fn(async (p: any) => {
      participants.set(p.id, p);
      return p;
    }),
    update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      const current = participants.get(id);
      if (current) Object.assign(current, patch);
      return { affected: current ? 1 : 0 };
    }),
  };
  const encounterService: any = {
    getParticipant: jest.fn(async (pid: string) => {
      const p = participants.get(pid);
      if (!p) throw new Error(`no participant ${pid}`);
      return p;
    }),
    getById: jest.fn(async () => encounter),
    resolveCharacterOwner: jest.fn(async (_cid: string, fb: string) => fb),
  };
  const eventService: any = { emit: jest.fn(async () => undefined) };
  const stateService: any = {
    updateHp: jest.fn(
      async (_uid: string, cid: string, dto: { damage?: number }) => {
        const row = hpByChar[cid] ?? { current: 20, max: 20 };
        if (dto.damage) row.current = Math.max(0, row.current - dto.damage);
        hpByChar[cid] = row;
        return {
          currentHp: row.current,
          tempHp: 0,
          maxHp: row.max,
          isDown: row.current === 0,
          instantDeath: false,
          deathSaves: { successes: 0, failures: 0 },
        };
      },
    ),
    updateDeathSaves: jest.fn(async () => ({
      successes: 0,
      failures: 0,
      stabilized: false,
      dead: false,
    })),
    getFeatureUsesUsed: jest.fn(async () => ({})),
  };
  const sheetService: any = {
    computeSheet: jest.fn(async () => ({
      armorClass: 14,
      currentHp: 50,
      maxHp: 50,
      tempHp: 0,
      proficiencyBonus: 3,
      abilityScores: [],
      classes: [],
      features: [],
      spellSlots: [],
      source: { code: "PHB" },
    })),
  };
  const actionsService: any = {
    getActions: jest.fn(async () => ({ actions: [], bonusActions: [] })),
  };
  const sessionService: any = {
    getById: jest.fn(async () => ({ campaignId: null })),
  };
  const movementService: any = {
    initializeTurn: jest.fn(async () => undefined),
  };
  const savingThrowService: any = {
    resolveAbilitySave: jest.fn(async () => ({ total: 10, success: true })),
  };

  const diceService = new DiceService();
  diceService.setSeed(42);
  const conditionEffects = new ConditionEffectsService();
  const monsterActionResolver = new MonsterActionResolver();
  const effectInstanceService: any = {
    addEffect: jest.fn(async (target: any, input: any) => {
      const effect = {
        id: `effect-${Math.random().toString(36).slice(2, 8)}`,
        ...input,
        appliedAt: new Date().toISOString(),
      };
      target.effectInstances = [...(target.effectInstances ?? []), effect];
      participants.set(target.id, target);
      return {
        effect,
        applied: true,
        events: [
          {
            event_type: "effect_applied",
            actor_participant_id: input.sourceCasterParticipantId,
            target_participant_id: target.id,
            data: {
              effectId: effect.id,
              kind: effect.kind,
              sourceFeatureSlug: effect.sourceFeatureSlug,
              payload: effect.payload,
              expiresAt: effect.expiresAt,
            },
          },
        ],
      };
    }),
    removeEffect: jest.fn(async (target: any, effectId: string) => {
      const before = target.effectInstances ?? [];
      const removed = before.find((effect: any) => effect.id === effectId);
      target.effectInstances = before.filter(
        (effect: any) => effect.id !== effectId,
      );
      participants.set(target.id, target);
      return { removed: Boolean(removed), events: [] };
    }),
    removeAllByConcentrationBreak: jest.fn(async () => ({ events: [] })),
    tickAtEndOfTurn: jest.fn(async () => ({
      events: [],
      ticked: [],
      expired: [],
    })),
    tickAtEndOfCasterTurn: jest.fn(async () => ({
      events: [],
      expired: [],
    })),
    expireAtParticipantTurnEnd: jest.fn(async () => ({
      events: [],
      expired: [],
    })),
  };

  const combat = new CombatService(
    encounterRepo,
    participantRepo,
    diceService,
    conditionEffects,
    encounterService,
    eventService,
    sheetService,
    stateService,
    actionsService,
    movementService,
    sessionService,
    savingThrowService,
    monsterActionResolver,
    {
      listActions: async () => [],
      resolveSlug: async () => null,
      listAvailableSlugs: async () => [],
    } as any,
    {
      applyCondition: async () => ({
        events: [],
        instance: {} as any,
        concentrationBroken: false,
      }),
      removeConditionInstance: async () => ({ events: [], removed: false }),
      removeConditionsEndedByDamage: async () => [],
    } as any,
    effectInstanceService,
    {
      startNew: async () => ({ events: [], broken: false }),
      break: async () => ({ events: [] }),
      breakDueToDeath: async () => ({ events: [] }),
      trackAppliedEffect: async () => {},
      checkBreakOnCondition: async () => ({ events: [], broken: false }),
      decrementDurationFor: async () => ({ events: [] }),
    } as any,
    { resolveInvocation: async () => ({ resolved: false, events: [] }) } as any,
    { consumeIfArmed: async () => ({ consumed: false }) } as any,
    {
      resolveOnHit: async () => ({ applied: [], extraDamage: 0, events: [] }),
      resolveOnMiss: () => ({ events: [] }),
    } as any,
    {
      resolveAttackModifiers: () => ({
        attackBonus: 0,
        damageBonus: 0,
        rerollLowDamage: false,
      }),
      resolveAcBonus: () => 0,
      applyRerollLowDamage: (r: number[]) => ({
        rolls: r,
        total: r.reduce((s, v) => s + v, 0),
        rerolled: false,
      }),
    } as any,
    {
      applyDamageToForm: async () => ({
        absorbedByForm: 0,
        overflowToOriginal: 0,
        reverted: false,
      }),
      isTransformed: () => false,
      getActiveForm: () => null,
      enterForm: async () => ({}),
      revertForm: async () => ({}),
      getEffectiveSpeed: () => null,
      getEffectiveAc: () => null,
      getEffectiveActions: () => null,
    } as any,
    {
      consumeBardicInspirationIfPresent: async () => ({
        consumed: false,
        bonus: 0,
        events: [],
      }),
      grantBardicInspiration: async () => ({ events: [], dieSize: 6 }),
      getBardicInspirationDie: () => 6,
    } as any,
    {
      getModifiers: () => ({
        disadvAbility: false,
        disadvAttack: false,
        disadvSave: false,
        speedMultiplier: 1,
        speedPenaltyFt: 0,
        maxHpMultiplier: 1,
        dead: false,
        d20Penalty: 0,
      }),
      getLevelFromInstances: () => 0,
    } as any,
    {
      runStartOfCombat: async () => ({ events: [] }),
      eldritchMaster: async () => ({
        ok: false,
        code: "TEST_STUB",
        events: [],
      }),
    } as any,
    {
      shouldOfferShield: async () => null,
      shouldOfferDeflectAttacks: async () => null,
      shouldOfferUncannyDodge: async () => null,
    } as any,

    { tryAutoEnd: async () => null, detectOutcome: async () => null } as any,
    { processRoundStart: async () => [] } as any,
    { processAfterPcTurn: async () => [] } as any,
    { tryParryAfterAttackRoll: async () => null } as any,
    { run: async () => ({ events: [] }) } as any,
  );

  return {
    combat,
    participants,
    encounter,
    hpByChar,
    diceService,
    sheetService,
    actionsService,
    effectInstanceService,
  };
}

describe("CombatService — US2 multiattack", () => {
  it("executes two sub-attacks for owlbear multiattack, consumes action once", async () => {
    const h = createHarness();
    const owlbear = makeParticipant({
      id: "ob-1",
      type: "monster",
      monster: {
        name: "Owlbear",
        armor_class: [{ value: 13 }],
        actions: [
          {
            name: "Multiattack",
            desc: "The owlbear makes two attacks: one with its beak and one with its claws.",
          },
          {
            name: "Beak",
            desc: "+7 to hit",
            attack_bonus: 7,
            damage: [
              { damage_dice: "1d10", damage_type: { name: "piercing" } },
            ],
          },
          {
            name: "Claws",
            desc: "+7 to hit",
            attack_bonus: 7,
            damage: [{ damage_dice: "2d8", damage_type: { name: "slashing" } }],
          },
        ],
        multiattack: {
          sequence: [
            { actionName: "Beak", count: 1 },
            { actionName: "Claws", count: 1 },
          ],
          description: "The owlbear makes two attacks...",
        },
      },
      faction: "enemy",
    });
    const pc = makeParticipant({ id: "pc-1", characterId: "char-1" });
    h.participants.set(owlbear.id, owlbear);
    h.participants.set(pc.id, pc);
    h.encounter.turnOrder = [owlbear.id, pc.id];
    h.encounter.currentTurnIndex = 0;
    h.hpByChar["char-1"] = { current: 50, max: 50 };

    const dto: AttackDto = {
      attackerParticipantId: owlbear.id,
      targetParticipantId: pc.id,
      targetParticipantIds: [pc.id, pc.id],
      actionName: "Multiattack",
      ownerUserId: "dm-1",
    };

    const res = await h.combat.resolveMultiattack(h.encounter.id, dto);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.kind).toBe("multiattack");
    expect(res.value.actionConsumed).toBe(true);
    expect(res.value.subAttacks.length).toBe(2);
    expect(res.value.subAttacks[0].subActionName).toBe("Beak");
    expect(res.value.subAttacks[1].subActionName).toBe("Claws");
    expect(owlbear.actionUsed).toBe(true);
    expect(
      (h.combat as any).participantRepo.update,
    ).toHaveBeenCalledWith(owlbear.id, { actionUsed: true });
  });

  it("uses the active form AC when a transformed PC is attacked", async () => {
    const h = createHarness();
    const owlbear = makeParticipant({
      id: "ob-form-ac",
      type: "monster",
      monster: {
        name: "Owlbear",
        armor_class: [{ value: 13 }],
        actions: [
          {
            name: "Beak",
            attack_bonus: 7,
            damage: [
              { damage_dice: "1d10", damage_type: { name: "piercing" } },
            ],
          },
        ],
        multiattack: {
          sequence: [{ actionName: "Beak", count: 1 }],
          description: "The owlbear makes one test attack.",
        },
      },
      faction: "enemy",
    });
    const transformedPc = makeParticipant({
      id: "pc-form-ac",
      characterId: "char-form-ac",
      transformationState: {
        source: "wild-shape",
        rulesMode: "xphb-wild-shape",
        form: {
          ac: 18,
          currentHp: 50,
          maxHp: 50,
        },
      },
    });
    h.participants.set(owlbear.id, owlbear);
    h.participants.set(transformedPc.id, transformedPc);
    h.encounter.turnOrder = [owlbear.id, transformedPc.id];
    h.hpByChar["char-form-ac"] = { current: 50, max: 50 };

    const res = await h.combat.resolveMultiattack(h.encounter.id, {
      attackerParticipantId: owlbear.id,
      targetParticipantIds: [transformedPc.id],
      actionName: "Multiattack",
      ownerUserId: "dm-1",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.subAttacks[0].attackRoll.targetAc).toBe(18);
  });

  it("applies Multiattack Defense only after the first hit and only against the same attacker", async () => {
    const h = createHarness();
    const attacker = makeParticipant({
      id: "multiattack-defense-attacker",
      type: "monster",
      monster: {
        name: "Owlbear",
        armor_class: [{ value: 13 }],
        actions: [
          {
            name: "Claw",
            attack_bonus: 7,
            damage: [
              { damage_dice: "1d6", damage_type: { name: "slashing" } },
            ],
          },
        ],
        multiattack: {
          sequence: [{ actionName: "Claw", count: 2 }],
          description: "Two claw attacks.",
        },
      },
      faction: "enemy",
    });
    const otherAttacker = makeParticipant({
      id: "multiattack-defense-other",
      type: "monster",
      monster: { name: "Other creature" },
      faction: "enemy",
    });
    const ranger = makeParticipant({
      id: "multiattack-defense-ranger",
      characterId: "char-multiattack-defense",
      currentHp: 50,
      maxHp: 50,
    });
    h.participants.set(attacker.id, attacker);
    h.participants.set(otherAttacker.id, otherAttacker);
    h.participants.set(ranger.id, ranger);
    h.encounter.turnOrder = [attacker.id, ranger.id, otherAttacker.id];
    h.hpByChar[ranger.characterId] = { current: 50, max: 50 };
    h.sheetService.computeSheet.mockResolvedValue({
      armorClass: 14,
      currentHp: 50,
      maxHp: 50,
      tempHp: 0,
      proficiencyBonus: 3,
      abilityScores: [],
      classes: [{ slug: "ranger-phb", level: 7 }],
      features: [
        {
          slug: "multiattack-defense-ranger-hunter-7-phb",
          active: true,
          sourceCode: "PHB",
        },
      ],
      spellSlots: [],
      source: { code: "PHB" },
    });
    jest
      .spyOn(h.diceService, "roll")
      .mockImplementation((sides: number) => (sides === 20 ? 10 : 1));

    const result = await h.combat.resolveMultiattack(h.encounter.id, {
      attackerParticipantId: attacker.id,
      targetParticipantIds: [ranger.id, ranger.id],
      actionName: "Multiattack",
      ownerUserId: "dm-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.subAttacks).toHaveLength(2);
    expect(result.value.subAttacks[0].attackRoll).toMatchObject({
      targetAc: 14,
      hit: true,
    });
    expect(result.value.subAttacks[1].attackRoll).toMatchObject({
      targetAc: 18,
      hit: false,
    });
    expect(
      result.events.filter(
        (event) => event.event_type === "multiattack_defense_triggered",
      ),
    ).toHaveLength(1);
    expect(
      result.events.filter(
        (event) => event.event_type === "multiattack_defense_ac_applied",
      ),
    ).toHaveLength(1);

    const persisted = ranger.effectInstances.find(
      (effect: any) =>
        effect.sourceFeatureSlug === "multiattack-defense",
    );
    expect(persisted).toMatchObject({
      kind: "ac_bonus",
      sourceCasterParticipantId: attacker.id,
      payload: {
        amount: 4,
        attackerParticipantId: attacker.id,
        turnParticipantIdAtTrigger: attacker.id,
      },
      expiresAt: { kind: "participant_turn_ends", value: 1 },
      expiresAtTurnEndParticipantId: attacker.id,
    });
    expect(
      (h.combat as any).resolveEffectInstanceDecisions(
        attacker,
        ranger,
        true,
      ).targetAcBonus,
    ).toBe(4);
    expect(
      (h.combat as any).resolveEffectInstanceDecisions(
        otherAttacker,
        ranger,
        true,
      ).targetAcBonus,
    ).toBe(0);
  });

  it("scopes an out-of-turn Multiattack Defense trigger to the turn currently in progress", async () => {
    const h = createHarness();
    const attacker = makeParticipant({
      id: "multiattack-defense-reaction-attacker",
      type: "monster",
      monster: {
        name: "Owlbear",
        armor_class: [{ value: 13 }],
        actions: [
          {
            name: "Claw",
            attack_bonus: 7,
            damage: [
              { damage_dice: "1d6", damage_type: { name: "slashing" } },
            ],
          },
        ],
      },
      faction: "enemy",
    });
    const ranger = makeParticipant({
      id: "multiattack-defense-reaction-ranger",
      characterId: "char-multiattack-defense-reaction",
      currentHp: 50,
      maxHp: 50,
    });
    h.participants.set(attacker.id, attacker);
    h.participants.set(ranger.id, ranger);
    h.encounter.turnOrder = [ranger.id, attacker.id];
    h.encounter.currentTurnIndex = 0;
    h.hpByChar[ranger.characterId] = { current: 50, max: 50 };
    h.sheetService.computeSheet.mockResolvedValue({
      armorClass: 14,
      currentHp: 50,
      maxHp: 50,
      tempHp: 0,
      proficiencyBonus: 3,
      abilityScores: [],
      classes: [{ slug: "ranger-phb", level: 7 }],
      features: [
        {
          slug: "multiattack-defense-ranger-hunter-7-phb",
          active: true,
          sourceCode: "PHB",
        },
      ],
      spellSlots: [],
      source: { code: "PHB" },
    });
    jest
      .spyOn(h.diceService, "roll")
      .mockImplementation((sides: number) => (sides === 20 ? 10 : 1));
    const attack = {
      attackerParticipantId: attacker.id,
      targetParticipantId: ranger.id,
      actionName: "Claw",
      ownerUserId: "dm-1",
      _isSubAttack: true,
    };

    const first = await h.combat.resolveAttack(h.encounter.id, attack);
    const second = await h.combat.resolveAttack(h.encounter.id, attack);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.attackRoll).toMatchObject({ targetAc: 14, hit: true });
    expect(second.value.attackRoll).toMatchObject({ targetAc: 18, hit: false });
    expect(
      ranger.effectInstances.find(
        (effect: any) =>
          effect.sourceFeatureSlug === "multiattack-defense",
      ),
    ).toMatchObject({
      payload: expect.objectContaining({
        attackerParticipantId: attacker.id,
        turnParticipantIdAtTrigger: ranger.id,
        turnKey: `1:${ranger.id}`,
      }),
      expiresAt: { kind: "participant_turn_ends", value: 1 },
      expiresAtTurnEndParticipantId: ranger.id,
    });
    expect(
      first.events.find(
        (event) => event.event_type === "attack_roll",
      )?.data,
    ).toMatchObject({
      attackBoundEffectRefs: [
        expect.objectContaining({
          participantId: ranger.id,
          sourceFeatureSlug: "multiattack-defense",
        }),
      ],
    });

    h.encounter.currentTurnIndex = 1;
    const laterAttackerTurn = await h.combat.resolveAttack(
      h.encounter.id,
      attack,
    );
    expect(laterAttackerTurn.ok).toBe(true);
    if (!laterAttackerTurn.ok) return;
    expect(laterAttackerTurn.value.attackRoll).toMatchObject({
      targetAc: 14,
      hit: true,
    });
  });

  it("does not activate Multiattack Defense without the materialized PHB child feature", async () => {
    const h = createHarness();
    const attacker = makeParticipant({
      id: "multiattack-no-feature-attacker",
      type: "monster",
      monster: {
        name: "Owlbear",
        armor_class: [{ value: 13 }],
        actions: [
          {
            name: "Claw",
            attack_bonus: 7,
            damage: [
              { damage_dice: "1d6", damage_type: { name: "slashing" } },
            ],
          },
        ],
        multiattack: {
          sequence: [{ actionName: "Claw", count: 2 }],
          description: "Two claw attacks.",
        },
      },
      faction: "enemy",
    });
    const ranger = makeParticipant({
      id: "multiattack-no-feature-ranger",
      characterId: "char-multiattack-no-feature",
      currentHp: 50,
      maxHp: 50,
    });
    h.participants.set(attacker.id, attacker);
    h.participants.set(ranger.id, ranger);
    h.encounter.turnOrder = [attacker.id, ranger.id];
    h.hpByChar[ranger.characterId] = { current: 50, max: 50 };
    h.sheetService.computeSheet.mockResolvedValue({
      armorClass: 14,
      currentHp: 50,
      maxHp: 50,
      tempHp: 0,
      proficiencyBonus: 3,
      abilityScores: [],
      classes: [{ slug: "ranger-phb", level: 7 }],
      features: [
        {
          slug: "escape-the-horde-ranger-hunter-7-phb",
          active: true,
          sourceCode: "PHB",
        },
      ],
      spellSlots: [],
      source: { code: "PHB" },
    });
    jest
      .spyOn(h.diceService, "roll")
      .mockImplementation((sides: number) => (sides === 20 ? 10 : 1));

    const result = await h.combat.resolveMultiattack(h.encounter.id, {
      attackerParticipantId: attacker.id,
      targetParticipantIds: [ranger.id, ranger.id],
      actionName: "Multiattack",
      ownerUserId: "dm-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.subAttacks.map((attack) => attack.attackRoll.targetAc),
    ).toEqual([14, 14]);
    expect(
      result.events.some(
        (event) => event.event_type === "multiattack_defense_triggered",
      ),
    ).toBe(false);
    expect(ranger.effectInstances).toEqual([]);
  });

  it("does not activate Multiattack Defense while a transformation does not retain class features", async () => {
    const h = createHarness();
    const attacker = makeParticipant({
      id: "multiattack-defense-polymorph-attacker",
      type: "monster",
      monster: {
        name: "Owlbear",
        armor_class: [{ value: 13 }],
        actions: [
          {
            name: "Claw",
            attack_bonus: 7,
            damage: [
              { damage_dice: "1d6", damage_type: { name: "slashing" } },
            ],
          },
        ],
      },
      faction: "enemy",
    });
    const ranger = makeParticipant({
      id: "multiattack-defense-polymorphed-ranger",
      characterId: "char-multiattack-defense-polymorphed",
      currentHp: 50,
      maxHp: 50,
      transformationState: {
        source: "polymorph-spell",
        rulesMode: "legacy-form-hp",
        retainedAbilities: [],
        form: {
          ac: 14,
          currentHp: 50,
          maxHp: 50,
          actions: [],
        },
      },
    });
    h.participants.set(attacker.id, attacker);
    h.participants.set(ranger.id, ranger);
    h.encounter.turnOrder = [attacker.id, ranger.id];
    h.hpByChar[ranger.characterId] = { current: 50, max: 50 };
    h.sheetService.computeSheet.mockResolvedValue({
      armorClass: 14,
      currentHp: 50,
      maxHp: 50,
      tempHp: 0,
      proficiencyBonus: 3,
      abilityScores: [],
      classes: [{ slug: "ranger-phb", level: 7 }],
      features: [
        {
          slug: "multiattack-defense-ranger-hunter-7-phb",
          active: true,
          sourceCode: "PHB",
        },
      ],
      spellSlots: [],
      source: { code: "PHB" },
    });
    jest
      .spyOn(h.diceService, "roll")
      .mockImplementation((sides: number) => (sides === 20 ? 10 : 1));

    const attack = {
      attackerParticipantId: attacker.id,
      targetParticipantId: ranger.id,
      actionName: "Claw",
      ownerUserId: "dm-1",
      _isSubAttack: true,
    };
    const first = await h.combat.resolveAttack(h.encounter.id, attack);
    const second = await h.combat.resolveAttack(h.encounter.id, attack);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.attackRoll.targetAc).toBe(14);
    expect(second.value.attackRoll.targetAc).toBe(14);
    expect(
      ranger.effectInstances.some(
        (effect: any) =>
          effect.sourceFeatureSlug === "multiattack-defense",
      ),
    ).toBe(false);
  });

  it("also applies Multiattack Defense to subsequent spell attacks by the same creature", async () => {
    const h = createHarness();
    const attacker = makeParticipant({
      id: "multiattack-defense-spell-attacker",
      type: "monster",
      displayName: "Mage",
      faction: "enemy",
    });
    const ranger = makeParticipant({
      id: "multiattack-defense-spell-ranger",
      characterId: "char-multiattack-defense-spell",
      currentHp: 50,
      maxHp: 50,
    });
    h.participants.set(attacker.id, attacker);
    h.participants.set(ranger.id, ranger);
    h.sheetService.computeSheet.mockResolvedValue({
      armorClass: 14,
      currentHp: 50,
      maxHp: 50,
      tempHp: 0,
      proficiencyBonus: 3,
      abilityScores: [],
      classes: [{ slug: "ranger-phb", level: 7 }],
      features: [
        {
          slug: "multiattack-defense-ranger-hunter-7-phb",
          active: true,
          sourceCode: "PHB",
        },
      ],
      spellSlots: [],
      source: { code: "PHB" },
    });
    jest
      .spyOn(h.diceService, "roll")
      .mockImplementation((sides: number) => (sides === 20 ? 10 : 1));

    const first = await h.combat.resolveSpellAttackRoll(attacker, ranger, {
      attackBonus: 7,
      actionName: "Scorching Ray",
      isMelee: false,
      ownerUserId: "dm-1",
    });
    const second = await h.combat.resolveSpellAttackRoll(attacker, ranger, {
      attackBonus: 7,
      actionName: "Scorching Ray",
      isMelee: false,
      ownerUserId: "dm-1",
    });

    expect(first.attackRoll).toMatchObject({
      targetAc: 14,
      hit: true,
    });
    expect(second.attackRoll).toMatchObject({
      targetAc: 18,
      hit: false,
    });
    expect(
      first.events.filter(
        (event) => event.event_type === "multiattack_defense_triggered",
      ),
    ).toHaveLength(1);
    expect(
      second.events.filter(
        (event) => event.event_type === "multiattack_defense_ac_applied",
      ),
    ).toHaveLength(1);
  });

  it("returns INVALID_PAYLOAD when targetParticipantIds count mismatches expected", async () => {
    const h = createHarness();
    const owlbear = makeParticipant({
      id: "ob-2",
      type: "monster",
      monster: {
        name: "Owlbear",
        armor_class: [{ value: 13 }],
        actions: [],
        multiattack: {
          sequence: [
            { actionName: "Beak", count: 1 },
            { actionName: "Claws", count: 1 },
          ],
          description: "The owlbear makes two attacks...",
        },
      },
    });
    const pc = makeParticipant({ id: "pc-2", characterId: "char-2" });
    h.participants.set(owlbear.id, owlbear);
    h.participants.set(pc.id, pc);
    h.encounter.turnOrder = [owlbear.id, pc.id];

    const dto: AttackDto = {
      attackerParticipantId: owlbear.id,
      targetParticipantId: pc.id,
      targetParticipantIds: [pc.id],
      actionName: "Multiattack",
      ownerUserId: "dm-1",
    };

    const res = await h.combat.resolveMultiattack(h.encounter.id, dto);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("INVALID_PAYLOAD");
    expect(owlbear.actionUsed).toBe(false);
  });

  it("returns INVALID_MULTIATTACK when monster has no multiattack populated", async () => {
    const h = createHarness();
    const goblin = makeParticipant({
      id: "gob-1",
      type: "monster",
      monster: {
        name: "Goblin",
        armor_class: [{ value: 15 }],
        actions: [],
        multiattack: null,
      },
    });
    const pc = makeParticipant({ id: "pc-3", characterId: "char-3" });
    h.participants.set(goblin.id, goblin);
    h.participants.set(pc.id, pc);
    h.encounter.turnOrder = [goblin.id, pc.id];

    const dto: AttackDto = {
      attackerParticipantId: goblin.id,
      targetParticipantId: pc.id,
      targetParticipantIds: [pc.id],
      actionName: "Multiattack",
      ownerUserId: "dm-1",
    };

    const res = await h.combat.resolveMultiattack(h.encounter.id, dto);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("INVALID_MULTIATTACK");
  });

  it("interrupts sequence when a target is defeated before its sub-attack", async () => {
    const h = createHarness();
    const owlbear = makeParticipant({
      id: "ob-3",
      type: "monster",
      monster: {
        name: "Owlbear",
        armor_class: [{ value: 13 }],
        actions: [
          {
            name: "Beak",
            desc: "+7 to hit",
            attack_bonus: 7,
            damage: [
              { damage_dice: "1d10", damage_type: { name: "piercing" } },
            ],
          },
          {
            name: "Claws",
            desc: "+7 to hit",
            attack_bonus: 7,
            damage: [{ damage_dice: "2d8", damage_type: { name: "slashing" } }],
          },
        ],
        multiattack: {
          sequence: [
            { actionName: "Beak", count: 1 },
            { actionName: "Claws", count: 1 },
          ],
          description: "",
        },
      },
    });
    const dead = makeParticipant({
      id: "pc-dead",
      characterId: "char-d",
      isDefeated: true,
    });
    const alive = makeParticipant({ id: "pc-alive", characterId: "char-a" });
    h.participants.set(owlbear.id, owlbear);
    h.participants.set(dead.id, dead);
    h.participants.set(alive.id, alive);
    h.encounter.turnOrder = [owlbear.id, dead.id, alive.id];

    const dto: AttackDto = {
      attackerParticipantId: owlbear.id,
      targetParticipantId: dead.id,
      targetParticipantIds: [dead.id, alive.id],
      actionName: "Multiattack",
      ownerUserId: "dm-1",
    };

    const res = await h.combat.resolveMultiattack(h.encounter.id, dto);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.interruptedAt).toEqual({
      index: 0,
      reason: "target_defeated",
    });
    expect(res.value.subAttacks.length).toBe(0);
    expect(owlbear.actionUsed).toBe(true);
  });

  it("pauses remaining sub-attacks while Relentless Endurance awaits a decision", async () => {
    const h = createHarness();
    const owlbear = makeParticipant({
      id: "ob-relentless",
      type: "monster",
      monster: {
        name: "Owlbear",
        actions: [
          { name: "Beak", attack_bonus: 7, damage: [] },
          { name: "Claws", attack_bonus: 7, damage: [] },
        ],
        multiattack: {
          sequence: [
            { actionName: "Beak", count: 1 },
            { actionName: "Claws", count: 1 },
          ],
          description: "",
        },
      },
      faction: "enemy",
    });
    const orc = makeParticipant({
      id: "orc-relentless",
      characterId: "char-orc-relentless",
      currentHp: 0,
      dyingState: "dying",
      effectInstances: [],
    });
    h.participants.set(owlbear.id, owlbear);
    h.participants.set(orc.id, orc);
    h.encounter.turnOrder = [owlbear.id, orc.id];
    h.encounter.currentTurnIndex = 0;

    const resolveAttack = jest
      .spyOn(h.combat, "resolveAttack")
      .mockImplementationOnce(async () => {
        orc.effectInstances = [
          {
            id: "pending-relentless",
            kind: "relentless_endurance_pending",
            payload: { triggerEventId: "trigger-1" },
          },
        ];
        return {
          ok: true,
          value: {
            attackRoll: {
              roll: 15,
              modifier: 7,
              total: 22,
              targetAc: 14,
              hit: true,
              critical: false,
            },
            targetHpBefore: 5,
            targetHpAfter: 0,
            targetDefeated: false,
          },
          events: [],
        } as any;
      });

    const res = await h.combat.resolveMultiattack(h.encounter.id, {
      attackerParticipantId: owlbear.id,
      targetParticipantIds: [orc.id, orc.id],
      actionName: "Multiattack",
      ownerUserId: "dm-1",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(resolveAttack).toHaveBeenCalledTimes(1);
    expect(res.value.subAttacks).toHaveLength(1);
    expect(res.value.interruptedAt).toEqual({
      index: 0,
      reason: "relentless_endurance_pending",
    });
    expect(owlbear.actionUsed).toBe(true);
  });
});

describe("CombatService — Ranger Hunter PHB passives", () => {
  function configureColossusSlayerHarness(
    h: ReturnType<typeof createHarness>,
    options: {
      targetCurrentHp?: number;
      featureSlug?: string;
      featureActive?: boolean;
      critical?: boolean;
      attackRoll?: number;
      damageResistances?: string[];
    } = {},
  ) {
    const ranger = makeParticipant({
      id: "colossus-ranger",
      characterId: "char-colossus-ranger",
      displayName: "Hunter",
      currentHp: 48,
      maxHp: 48,
      attacksMaxThisTurn: 2,
      attacksUsedThisTurn: 0,
      effectInstances: [],
      faction: "ally",
    });
    const target = makeParticipant({
      id: "colossus-target",
      type: "monster",
      characterId: undefined,
      monster: {
        name: "Ogre",
        armor_class: [{ value: 11 }],
        hit_points: 50,
        damage_immunities: [],
        damage_resistances: options.damageResistances ?? [],
        damage_vulnerabilities: [],
      },
      displayName: "Ogre",
      currentHp: options.targetCurrentHp ?? 40,
      maxHp: 50,
      faction: "enemy",
    });
    h.participants.set(ranger.id, ranger);
    h.participants.set(target.id, target);
    h.encounter.turnOrder = [ranger.id, target.id];
    h.encounter.currentTurnIndex = 0;
    h.sheetService.computeSheet.mockResolvedValue({
      armorClass: 15,
      currentHp: 48,
      maxHp: 48,
      tempHp: 0,
      proficiencyBonus: 3,
      abilityScores: [
        { slug: "str", modifier: 3 },
        { slug: "dex", modifier: 4 },
        { slug: "wis", modifier: 2 },
      ],
      classes: [{ slug: "ranger-phb", level: 5 }],
      features: [
        {
          slug:
            options.featureSlug ??
            "colossus-slayer-ranger-hunter-3-phb",
          active: options.featureActive ?? true,
          sourceCode: "PHB",
        },
      ],
      spellSlots: [],
      source: { code: "PHB" },
    });
    h.actionsService.getActions.mockResolvedValue({
      actions: [
        {
          id: "weapon-longbow",
          name: "Longbow",
          source: "weapon",
          attackBonus: 8,
          damage: { dice: "1d8", type: "piercing", bonus: 4 },
          range: "150/600 ft.",
          properties: ["ammunition", "heavy", "two-handed"],
        },
      ],
      bonusActions: [],
    });
    jest
      .spyOn(h.diceService, "roll")
      .mockImplementation((sides: number) => {
        if (sides === 20) {
          return options.attackRoll ?? (options.critical ? 20 : 15);
        }
        if (sides === 8) return 4;
        return 1;
      });
    return { ranger, target };
  }

  function configureFeralSensesHarness(
    h: ReturnType<typeof createHarness>,
    options: {
      level?: number;
      featureActive?: boolean;
      attackerConditions?: string[];
      includeFoeSlayer?: boolean;
    } = {},
  ) {
    const ranger = makeParticipant({
      id: "feral-senses-ranger",
      characterId: "char-feral-senses-ranger",
      displayName: "Hunter",
      currentHp: 194,
      maxHp: 194,
      conditions: options.attackerConditions ?? [],
      attacksMaxThisTurn: 2,
      attacksUsedThisTurn: 0,
      effectInstances: [],
      faction: "ally",
    });
    const target = makeParticipant({
      id: "feral-senses-target",
      type: "monster",
      characterId: undefined,
      monster: {
        name: "Invisible Scout",
        armor_class: [{ value: 10 }],
        hit_points: 30,
        damage_immunities: [],
        damage_resistances: [],
        damage_vulnerabilities: [],
      },
      displayName: "Invisible Scout",
      currentHp: 30,
      maxHp: 30,
      conditions: ["invisible"],
      faction: "enemy",
    });
    h.participants.set(ranger.id, ranger);
    h.participants.set(target.id, target);
    h.encounter.turnOrder = [ranger.id, target.id];
    h.encounter.currentTurnIndex = 0;
    h.sheetService.computeSheet.mockResolvedValue({
      armorClass: 15,
      currentHp: 194,
      maxHp: 194,
      tempHp: 0,
      proficiencyBonus: 6,
      abilityScores: [
        { slug: "dex", modifier: 5 },
        { slug: "wis", modifier: 5 },
      ],
      classes: [{ slug: "ranger-phb", level: options.level ?? 20 }],
      features: [
        {
          slug: "feral-senses-ranger-18-phb",
          active: options.featureActive ?? true,
          sourceCode: "PHB",
        },
        ...(options.includeFoeSlayer
          ? [
              {
                slug: "foe-slayer-ranger-20-phb",
                active: true,
                sourceCode: "PHB",
              },
            ]
          : []),
      ],
      hasFoeSlayer: options.includeFoeSlayer === true,
      spellSlots: [],
      source: { code: "PHB" },
    });
    h.actionsService.getActions.mockResolvedValue({
      actions: [
        {
          id: "weapon-longbow",
          name: "Longbow",
          source: "weapon",
          attackBonus: 11,
          damage: { dice: "1d8", type: "piercing", bonus: 5 },
          range: "150/600 ft.",
          properties: ["ammunition", "heavy", "two-handed"],
        },
      ],
      bonusActions: [],
    });
    jest
      .spyOn(h.diceService, "roll")
      .mockImplementation((sides: number) => (sides === 20 ? 15 : 1));
    return { ranger, target };
  }

  it("Feral Senses removes only the invisible-target disadvantage", async () => {
    const h = createHarness();
    const { ranger, target } = configureFeralSensesHarness(h);

    const result = await h.combat.resolveAttack(h.encounter.id, {
      attackerParticipantId: ranger.id,
      targetParticipantId: target.id,
      actionName: "Longbow",
      actionSlug: "weapon-longbow",
      ownerUserId: "ranger-owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.attackRoll).toMatchObject({
      roll: 15,
      hasAdvantage: false,
      hasDisadvantage: false,
      advantageCancelled: false,
      hit: true,
    });
    expect(
      result.events.find(
        (event) => event.event_type === "attack_roll",
      )?.data,
    ).toMatchObject({
      feralSensesApplied: true,
      hasDisadvantage: false,
    });
  });

  it("Feral Senses preserves disadvantage from another source", async () => {
    const h = createHarness();
    const { ranger, target } = configureFeralSensesHarness(h, {
      attackerConditions: ["poisoned"],
    });

    const result = await h.combat.resolveAttack(h.encounter.id, {
      attackerParticipantId: ranger.id,
      targetParticipantId: target.id,
      actionName: "Longbow",
      actionSlug: "weapon-longbow",
      ownerUserId: "ranger-owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.attackRoll.hasDisadvantage).toBe(true);
    expect(
      result.events.find(
        (event) => event.event_type === "attack_roll",
      )?.data,
    ).toMatchObject({
      feralSensesApplied: true,
      hasDisadvantage: true,
    });
  });

  it("does not auto-apply Foe Slayer without a Favored Enemy choice", async () => {
    const h = createHarness();
    const { ranger, target } = configureFeralSensesHarness(h, {
      includeFoeSlayer: true,
    });

    const result = await h.combat.resolveAttack(h.encounter.id, {
      attackerParticipantId: ranger.id,
      targetParticipantId: target.id,
      actionName: "Longbow",
      actionSlug: "weapon-longbow",
      ownerUserId: "ranger-owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.events.some(
        (event) => event.event_type === "foe_slayer_applied",
      ),
    ).toBe(false);
    expect(
      (result.value.damageRoll as any).extraDamageBonuses.some(
        (bonus: any) => bonus.source === "foe-slayer",
      ),
    ).toBe(false);
    expect(
      ranger.effectInstances.some(
        (effect: any) => effect.kind === "foe_slayer_used_this_turn",
      ),
    ).toBe(false);
  });

  it("adds 1d8 once on the Ranger turn when a weapon hits an already wounded target", async () => {
    const h = createHarness();
    const { ranger, target } = configureColossusSlayerHarness(h);
    const attack = {
      attackerParticipantId: ranger.id,
      targetParticipantId: target.id,
      actionName: "Longbow",
      actionSlug: "weapon-longbow",
      ownerUserId: "ranger-owner",
    };

    const first = await h.combat.resolveAttack(h.encounter.id, attack);
    const second = await h.combat.resolveAttack(h.encounter.id, attack);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(
      (first.value.damageRoll as any).extraDamageBonuses,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "colossus-slayer",
          amount: 4,
          dice: "1d8",
          damageType: "piercing",
        }),
      ]),
    );
    expect(
      (second.value.damageRoll as any).extraDamageBonuses.some(
        (bonus: any) => bonus.source === "colossus-slayer",
      ),
    ).toBe(false);
    expect(
      first.events.filter(
        (event) => event.event_type === "colossus_slayer_damage",
      ),
    ).toHaveLength(1);
    expect(
      second.events.some(
        (event) => event.event_type === "colossus_slayer_damage",
      ),
    ).toBe(false);
    expect(
      ranger.effectInstances.filter(
        (effect: any) =>
          effect.kind === "colossus_slayer_used_this_turn",
      ),
    ).toEqual([
      expect.objectContaining({
        sourceFeatureSlug: "colossus-slayer",
        sourceCasterParticipantId: ranger.id,
        payload: expect.objectContaining({
          targetParticipantId: target.id,
          turnParticipantIdAtTrigger: ranger.id,
          turnKey: `1:${ranger.id}`,
        }),
        expiresAt: { kind: "participant_turn_ends", value: 1 },
        expiresAtTurnEndParticipantId: ranger.id,
      }),
    ]);
  });

  it("applies Colossus Slayer once during an out-of-turn Opportunity or Readied attack", async () => {
    const h = createHarness();
    const { ranger, target } = configureColossusSlayerHarness(h);
    h.encounter.turnOrder = [target.id, ranger.id];
    h.encounter.currentTurnIndex = 0;
    const reactionAttack = {
      attackerParticipantId: ranger.id,
      targetParticipantId: target.id,
      actionName: "Longbow",
      actionSlug: "weapon-longbow",
      ownerUserId: "ranger-owner",
      _isSubAttack: true,
    };

    const firstReaction = await h.combat.resolveAttack(
      h.encounter.id,
      reactionAttack,
    );
    const secondReaction = await h.combat.resolveAttack(
      h.encounter.id,
      reactionAttack,
    );

    expect(firstReaction.ok).toBe(true);
    expect(secondReaction.ok).toBe(true);
    if (!firstReaction.ok || !secondReaction.ok) return;
    expect(
      (firstReaction.value.damageRoll as any).extraDamageBonuses,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "colossus-slayer",
          amount: 4,
        }),
      ]),
    );
    expect(
      (secondReaction.value.damageRoll as any).extraDamageBonuses.some(
        (bonus: any) => bonus.source === "colossus-slayer",
      ),
    ).toBe(false);
    expect(
      firstReaction.events.find(
        (event) => event.event_type === "attack_roll",
      )?.data,
    ).toMatchObject({
      attackBoundEffectRefs: [
        expect.objectContaining({
          participantId: ranger.id,
          sourceFeatureSlug: "colossus-slayer",
        }),
      ],
    });
    expect(
      ranger.effectInstances.find(
        (effect: any) =>
          effect.kind === "colossus_slayer_used_this_turn",
      ),
    ).toMatchObject({
      payload: {
        targetParticipantId: target.id,
        turnParticipantIdAtTrigger: target.id,
        turnKey: `1:${target.id}`,
      },
      expiresAt: { kind: "participant_turn_ends", value: 1 },
      expiresAtTurnEndParticipantId: target.id,
    });

    h.encounter.currentTurnIndex = 1;
    const rangerTurnAttack = await h.combat.resolveAttack(
      h.encounter.id,
      reactionAttack,
    );
    expect(rangerTurnAttack.ok).toBe(true);
    if (!rangerTurnAttack.ok) return;
    expect(
      (rangerTurnAttack.value.damageRoll as any).extraDamageBonuses.some(
        (bonus: any) => bonus.source === "colossus-slayer",
      ),
    ).toBe(true);
  });

  it("doubles the Colossus Slayer damage dice on a critical hit", async () => {
    const h = createHarness();
    const { ranger, target } = configureColossusSlayerHarness(h, {
      critical: true,
    });

    const result = await h.combat.resolveAttack(h.encounter.id, {
      attackerParticipantId: ranger.id,
      targetParticipantId: target.id,
      actionName: "Longbow",
      actionSlug: "weapon-longbow",
      ownerUserId: "ranger-owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const colossus = (
      result.value.damageRoll as any
    ).extraDamageBonuses.find(
      (bonus: any) => bonus.source === "colossus-slayer",
    );
    expect(colossus).toMatchObject({
      amount: 8,
      dice: "2d8",
      damageType: "piercing",
    });
    expect(
      result.events.find(
        (event) => event.event_type === "colossus_slayer_damage",
      )?.data,
    ).toMatchObject({
      dice: "2d8",
      rolls: [4, 4],
      damage: 8,
      critical: true,
    });
  });

  it("includes Colossus Slayer in the weapon damage before resistance", async () => {
    const h = createHarness();
    const { ranger, target } = configureColossusSlayerHarness(h, {
      damageResistances: ["piercing"],
    });

    const result = await h.combat.resolveAttack(h.encounter.id, {
      attackerParticipantId: ranger.id,
      targetParticipantId: target.id,
      actionName: "Longbow",
      actionSlug: "weapon-longbow",
      ownerUserId: "ranger-owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.damageRoll).toMatchObject({
      total: 12,
      finalDamage: 6,
      resisted: true,
    });
    expect(
      (result.value.damageRoll as any).extraDamageBonuses,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "colossus-slayer",
          amount: 4,
          finalAmount: 2,
          dice: "1d8",
        }),
      ]),
    );
    expect(
      result.events.find(
        (event) => event.event_type === "colossus_slayer_damage",
      )?.data,
    ).toMatchObject({
      damage: 4,
      finalAmount: 2,
      resisted: true,
      immune: false,
      vulnerable: false,
    });
  });

  it.each([
    {
      label: "uses wounded legacy-form HP even when the original body is full",
      formCurrentHp: 40,
      sheetCurrentHp: 50,
      expected: true,
    },
    {
      label: "does not use wounded original-body HP while the legacy form is full",
      formCurrentHp: 50,
      sheetCurrentHp: 40,
      expected: false,
    },
  ])(
    "$label for Colossus Slayer",
    async ({ formCurrentHp, sheetCurrentHp, expected }) => {
      const h = createHarness();
      const { ranger, target } = configureColossusSlayerHarness(h);
      target.type = "pc";
      target.characterId = "char-transformed-target";
      target.currentHp = sheetCurrentHp;
      target.maxHp = 50;
      target.transformationState = {
        source: "polymorph-spell",
        rulesMode: "legacy-form-hp",
        retainedAbilities: [],
        form: {
          ac: 11,
          currentHp: formCurrentHp,
          maxHp: 50,
        },
      };
      h.hpByChar[target.characterId] = {
        current: sheetCurrentHp,
        max: 50,
      };
      h.sheetService.computeSheet.mockImplementation(
        async (_ownerId: string, characterId: string) =>
          characterId === ranger.characterId
            ? {
                armorClass: 15,
                currentHp: 48,
                maxHp: 48,
                tempHp: 0,
                proficiencyBonus: 3,
                abilityScores: [
                  { slug: "str", modifier: 3 },
                  { slug: "dex", modifier: 4 },
                  { slug: "wis", modifier: 2 },
                ],
                classes: [{ slug: "ranger-phb", level: 5 }],
                features: [
                  {
                    slug: "colossus-slayer-ranger-hunter-3-phb",
                    active: true,
                    sourceCode: "PHB",
                  },
                ],
                spellSlots: [],
                source: { code: "PHB" },
              }
            : {
                armorClass: 11,
                currentHp: sheetCurrentHp,
                maxHp: 50,
                tempHp: 0,
                proficiencyBonus: 2,
                abilityScores: [],
                classes: [],
                features: [],
                spellSlots: [],
                source: { code: "PHB" },
              },
      );

      const result = await h.combat.resolveAttack(h.encounter.id, {
        attackerParticipantId: ranger.id,
        targetParticipantId: target.id,
        actionName: "Longbow",
        actionSlug: "weapon-longbow",
        ownerUserId: "ranger-owner",
        _isSubAttack: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(
        (result.value.damageRoll as any).extraDamageBonuses.some(
          (bonus: any) => bonus.source === "colossus-slayer",
        ),
      ).toBe(expected);
    },
  );

  it.each([
    {
      label: "an undamaged target",
      setup: { targetCurrentHp: 50 },
    },
    {
      label: "a different materialized Hunter choice",
      setup: {
        featureSlug: "horde-breaker-ranger-hunter-3-phb",
      },
    },
    {
      label: "an inactive Colossus Slayer child",
      setup: { featureActive: false },
    },
  ])("does not apply Colossus Slayer against $label", async ({ setup }) => {
    const h = createHarness();
    const { ranger, target } = configureColossusSlayerHarness(h, setup);

    const result = await h.combat.resolveAttack(h.encounter.id, {
      attackerParticipantId: ranger.id,
      targetParticipantId: target.id,
      actionName: "Longbow",
      actionSlug: "weapon-longbow",
      ownerUserId: "ranger-owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      (result.value.damageRoll as any).extraDamageBonuses.some(
        (bonus: any) => bonus.source === "colossus-slayer",
      ),
    ).toBe(false);
    expect(
      result.events.some(
        (event) => event.event_type === "colossus_slayer_damage",
      ),
    ).toBe(false);
    expect(
      ranger.effectInstances.some(
        (effect: any) =>
          effect.kind === "colossus_slayer_used_this_turn",
      ),
    ).toBe(false);
  });

  it("does not apply Colossus Slayer to an unarmed strike", async () => {
    const h = createHarness();
    const { ranger, target } = configureColossusSlayerHarness(h);

    const result = await h.combat.resolveAttack(h.encounter.id, {
      attackerParticipantId: ranger.id,
      targetParticipantId: target.id,
      actionName: "Unarmed Strike",
      actionSlug: "unarmed-strike",
      ownerUserId: "ranger-owner",
      options: { mode: "damage" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      (result.value.damageRoll as any).extraDamageBonuses.some(
        (bonus: any) => bonus.source === "colossus-slayer",
      ),
    ).toBe(false);
    expect(
      result.events.some(
        (event) => event.event_type === "colossus_slayer_damage",
      ),
    ).toBe(false);
  });

  it("does not consume Colossus Slayer when the weapon attack misses", async () => {
    const h = createHarness();
    const { ranger, target } = configureColossusSlayerHarness(h, {
      attackRoll: 2,
    });

    const result = await h.combat.resolveAttack(h.encounter.id, {
      attackerParticipantId: ranger.id,
      targetParticipantId: target.id,
      actionName: "Longbow",
      actionSlug: "weapon-longbow",
      ownerUserId: "ranger-owner",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.attackRoll.hit).toBe(false);
    expect(result.value.damageRoll).toBeUndefined();
    expect(
      result.events.some(
        (event) => event.event_type === "colossus_slayer_damage",
      ),
    ).toBe(false);
    expect(
      ranger.effectInstances.some(
        (effect: any) =>
          effect.kind === "colossus_slayer_used_this_turn",
      ),
    ).toBe(false);
  });
});
