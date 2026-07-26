import { CombatService } from "../services/combat.service";
import { DiceService } from "../services/dice.service";
import { ConditionEffectsService } from "../services/condition-effects.service";
import { MonsterActionResolver } from "../services/monster-action-resolver.service";
import { buildOtherworldlySteedStatBlock } from "../services/summon-stat-block";



function makeParticipant(overrides: Record<string, any> = {}): any {
  return {
    id: "p-" + Math.random().toString(36).slice(2, 8),
    type: "pc",
    encounterId: "enc-1",
    displayName: "Eilwen",
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

  const encounterRepo: any = {
    findOne: jest.fn(async () => encounter),
    save: jest.fn(async (e: any) => e),
  };
  const participantRepo: any = {
    find: jest.fn(async ({ where }: any) =>
      [...participants.values()].filter((participant) =>
        Object.entries(where ?? {}).every(
          ([key, value]) => participant[key] === value,
        ),
      ),
    ),
    findOne: jest.fn(
      async ({ where: { id } }: any) => participants.get(id) ?? null,
    ),
    save: jest.fn(async (p: any) => {
      participants.set(p.id, p);
      return p;
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
    updateHp: jest.fn(async () => ({
      currentHp: 20,
      tempHp: 0,
      maxHp: 20,
      isDown: false,
      instantDeath: false,
      deathSaves: { successes: 0, failures: 0 },
    })),
    updateDeathSaves: jest.fn(),
  };
  const sheetService: any = {
    computeSheet: jest.fn(async () => ({
      armorClass: 12,
      level: 3,
      speed: 30,
      abilityScores: { dex: 14, str: 10, con: 12, int: 16, wis: 13, cha: 10 },
      abilityModifiers: { dex: 2, str: 0, con: 1, int: 3, wis: 1, cha: 0 },
      attacks: [
        {
          name: "Cajado",
          toHit: 2,
          damage: "1d6",
          damageType: "bludgeoning",
          range: "5 ft.",
        },
      ],
    })),
  };
  const actionsService: any = {
    getActions: jest.fn(async () => ({
      actions: [],
      bonusActions: [],
      reactions: [],
    })),
  };
  const sessionService: any = {
    getById: jest.fn(async () => ({ campaignId: null })),
  };
  const movementService: any = {
    initializeTurn: jest.fn(async () => undefined),
    getSpeed: jest.fn(async () => 30),
  };
  const savingThrowService: any = {
    resolveAbilitySave: jest.fn(async () => ({ total: 10, success: true })),
  };

  const diceService = new DiceService();
  diceService.setSeed(42);
  const conditionEffects = new ConditionEffectsService();
  const monsterActionResolver = new MonsterActionResolver();

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
    {
      addEffect: async () => ({ effect: {} as any, events: [] }),
      removeEffect: async () => ({ removed: false, events: [] }),
      removeAllByConcentrationBreak: async () => ({ events: [] }),
      tickAtEndOfTurn: async () => ({ events: [], ticked: [], expired: [] }),
    } as any,
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
    { shouldOfferShield: async () => null } as any,

    { tryAutoEnd: async () => null, detectOutcome: async () => null } as any,
    { processRoundStart: async () => [] } as any,
    { processAfterPcTurn: async () => [] } as any,
    { tryParryAfterAttackRoll: async () => null } as any,
    { run: async () => ({ events: [] }) } as any,
    { listByEncounter: async () => [] } as any,
  );

  return { combat, participants, encounter };
}

const PHB_GENERIC_ORDER = [
  "Esquivar",
  "Disparada",
  "Desengajar",
  "Ajudar",
  "Esconder",
  "Preparar",
  "Procurar",
  "Usar Objeto",
];

describe("CombatService.getTurnActions — US13 bucketing (Spec 005)", () => {
  it("separa a Ação Atacar dos golpes desarmados concedidos por ação bônus", () => {
    const h = createHarness();
    const combat = h.combat as any;

    const afterGenericAction = makeParticipant({
      actionUsed: true,
      attacksUsedThisTurn: 0,
      attacksMaxThisTurn: 2,
      bonusUnarmedAttacksRemainingThisTurn: 0,
    });
    expect(
      combat.canUseStandardOrBonusAttack(afterGenericAction, false),
    ).toBe(false);

    const afterFirstExtraAttack = makeParticipant({
      actionUsed: true,
      attacksUsedThisTurn: 1,
      attacksMaxThisTurn: 2,
      bonusUnarmedAttacksRemainingThisTurn: 0,
    });
    expect(
      combat.canUseStandardOrBonusAttack(afterFirstExtraAttack, false),
    ).toBe(true);
    combat.consumeStandardOrBonusAttack(afterFirstExtraAttack, false);
    expect(afterFirstExtraAttack.actionUsed).toBe(true);
    expect(afterFirstExtraAttack.attacksUsedThisTurn).toBe(2);

    const flurryAfterDodge = makeParticipant({
      actionUsed: true,
      attacksUsedThisTurn: 0,
      attacksMaxThisTurn: 2,
      bonusUnarmedAttacksRemainingThisTurn: 2,
    });
    expect(combat.canUseStandardOrBonusAttack(flurryAfterDodge, true)).toBe(
      true,
    );
    combat.consumeStandardOrBonusAttack(flurryAfterDodge, true);
    expect(flurryAfterDodge.actionUsed).toBe(true);
    expect(flurryAfterDodge.attacksUsedThisTurn).toBe(0);
    expect(flurryAfterDodge.bonusUnarmedAttacksRemainingThisTurn).toBe(1);
  });

  it('mantém actions[] sem entradas de source==="generic" para PC', async () => {
    const h = createHarness();
    const pc = makeParticipant({ id: "pc-1", characterId: "char-1" });
    h.participants.set(pc.id, pc);
    h.encounter.turnOrder = [pc.id];

    const res = await h.combat.getTurnActions(h.encounter.id, pc.id, "dm-1");

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const genericInActions = res.value.actions.filter(
      (a) => a.source === "generic",
    );
    expect(genericInActions).toHaveLength(0);
  });

  it("popula genericActions[] com as 8 ações PHB canônicas em ordem", async () => {
    const h = createHarness();
    const pc = makeParticipant({ id: "pc-2", characterId: "char-2" });
    h.participants.set(pc.id, pc);
    h.encounter.turnOrder = [pc.id];

    const res = await h.combat.getTurnActions(h.encounter.id, pc.id, "dm-1");

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.genericActions).toBeDefined();
    expect(res.value.genericActions).toHaveLength(8);
    expect(res.value.genericActions!.map((a) => a.name)).toEqual(
      PHB_GENERIC_ORDER,
    );

    for (const action of res.value.genericActions!) {
      expect(action.source).toBe("generic");
      expect(action.sourceLabel).toBe("Ação PHB");
      expect(action.timing).toBe("action");
    }
  });

  it("funciona também para monstro (genericActions disponíveis a todo participante)", async () => {
    const h = createHarness();
    const goblin = makeParticipant({
      id: "gob-1",
      type: "monster",
      displayName: "Goblin 1",
      monster: {
        name: "Goblin",
        armor_class: [{ value: 15 }],
        hit_points: 7,
        actions: [
          {
            name: "Cimitarra",
            desc: "+4 to hit",
            attack_bonus: 4,
            damage: [
              { damage_dice: "1d6+2", damage_type: { name: "slashing" } },
            ],
          },
        ],
        multiattack: null,
      },
      faction: "enemy",
    });
    h.participants.set(goblin.id, goblin);
    h.encounter.turnOrder = [goblin.id];

    const res = await h.combat.getTurnActions(
      h.encounter.id,
      goblin.id,
      "dm-1",
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.genericActions).toHaveLength(8);
    expect(res.value.actions.every((a) => a.source !== "generic")).toBe(true);
  });

  it("familiar não herda ataques da forma, mas conserva as ações genéricas", async () => {
    const h = createHarness();
    const familiar = makeParticipant({
      id: "familiar-1",
      type: "monster",
      displayName: "Familiar (Coruja)",
      monster: {
        slug: "owl",
        name: "Owl",
        armor_class: [{ value: 11 }],
        hit_points: 1,
        actions: [
          {
            name: "Talons",
            desc: "+3 to hit",
            attack_bonus: 3,
            damage: [
              { damage_dice: "1", damage_type: { name: "slashing" } },
            ],
          },
        ],
      },
      appliedEffects: [
        {
          kind: "summon",
          refId: "find-familiar-spell",
          metadata: {
            source: "find-familiar-spell",
            familiarForm: "owl",
            cannotAttack: true,
          },
        },
      ],
      faction: "ally",
    });
    h.participants.set(familiar.id, familiar);
    h.encounter.turnOrder = [familiar.id];

    const res = await h.combat.getTurnActions(
      h.encounter.id,
      familiar.id,
      "dm-1",
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.actions).toHaveLength(0);
    expect(res.value.genericActions).toHaveLength(8);
  });

  it("publica e traduz o slug canônico do ataque de um corcel invocado", async () => {
    const h = createHarness();
    const steed = makeParticipant({
      id: "steed-1",
      type: "monster",
      displayName: "Corcel Extraplanar — Cavalo Celestial",
      monster: {
        slug: "warhorse",
        name: "Warhorse",
        armor_class: [{ value: 11 }],
        hit_points: 19,
        actions: [],
      },
      appliedEffects: [
        {
          kind: "summon",
          refId: "find-steed-spell",
          targetParticipantId: null,
          metadata: {
            source: "find-steed-spell",
            statBlock: {
              kind: "otherworldly-steed",
              form: "horse",
              slotLevel: 2,
              armorClass: 12,
              maxHp: 25,
              speed: 60,
              movementModes: { walk: 60 },
              abilities: {
                str: 18,
                dex: 12,
                con: 14,
                int: 6,
                wis: 12,
                cha: 8,
              },
              attack: {
                name: "Otherworldly Slam",
                attackBonus: 4,
                damageDice: "1d8",
                damageBonus: 2,
                damageType: "radiant",
                reachFt: 5,
                attacksPerAction: 1,
              },
              traits: { lifeBond: true },
              steed: {
                creatureType: "celestial",
                spellSaveDc: 12,
                bonusAction: "healing-touch",
              },
            },
          },
        },
      ],
      faction: "ally",
      positionX: 4,
      positionY: 4,
    });
    h.participants.set(steed.id, steed);
    h.encounter.turnOrder = [steed.id];

    const actions = await h.combat.getTurnActions(
      h.encounter.id,
      steed.id,
      "dm-1",
    );

    expect(actions.ok).toBe(true);
    if (!actions.ok) return;
    expect(actions.value.actions).toEqual([
      expect.objectContaining({
        id: "otherworldly-steed-otherworldly-slam",
        name: "Otherworldly Slam",
      }),
    ]);
    expect(actions.value.bonusActions).toEqual([
      expect.objectContaining({
        id: "otherworldly-steed-healing-touch",
        name: "Toque Curativo",
        timing: "bonus_action",
        uses: 1,
        usesMax: 1,
      }),
    ]);

    const translated = await h.combat.translateSlugToActionName(
      h.encounter.id,
      steed.id,
      actions.value.actions[0].id,
      "dm-1",
    );
    expect(translated).toEqual(
      expect.objectContaining({
        ok: true,
        value: "Otherworldly Slam",
      }),
    );

    const woundedAlly = makeParticipant({
      id: "ally-1",
      type: "monster",
      displayName: "Aliado ferido",
      currentHp: 5,
      maxHp: 30,
      positionX: 5,
      positionY: 4,
      faction: "ally",
      monster: { slug: "guard", name: "Guard", actions: [] },
    });
    h.participants.set(woundedAlly.id, woundedAlly);
    const gift = await h.combat.resolveOtherworldlySteedGift(
      h.encounter.id,
      {
        steedParticipantId: steed.id,
        targetParticipantId: woundedAlly.id,
        ownerUserId: "dm-1",
      },
    );
    expect(gift).toEqual(expect.objectContaining({ ok: true }));
    if (!gift.ok) return;
    expect(gift.value).toEqual(
      expect.objectContaining({
        gift: "healing-touch",
        targetParticipantId: woundedAlly.id,
        healingApplied: expect.any(Number),
      }),
    );
    expect(woundedAlly.currentHp).toBeGreaterThan(5);
    expect(steed.bonusActionUsed).toBe(true);
    expect(
      steed.appliedEffects[0].metadata.giftUsed,
    ).toBe(true);
  });

  it("espelha no corcel a cura real recebida pelo conjurador via magia de nível 1+", async () => {
    const h = createHarness();
    const caster = makeParticipant({
      id: "paladin-1",
      type: "monster",
      displayName: "Paladino",
      currentHp: 12,
      maxHp: 30,
      positionX: 4,
      positionY: 4,
      monster: { slug: "paladin", name: "Paladin", actions: [] },
    });
    const steed = makeParticipant({
      id: "steed-life-bond",
      type: "monster",
      displayName: "Corcel Extraplanar — Camelo Celestial",
      currentHp: 8,
      maxHp: 25,
      positionX: 5,
      positionY: 4,
      linkedCasterParticipantId: caster.id,
      monster: { slug: "warhorse", name: "Warhorse", actions: [] },
      appliedEffects: [
        {
          kind: "summon",
          refId: "find-steed-spell",
          targetParticipantId: null,
          metadata: {
            source: "find-steed-spell",
            statBlock: buildOtherworldlySteedStatBlock({
              appearance: "camel",
              creatureType: "celestial",
              slotLevel: 2,
              spellAttackBonus: 4,
              spellSaveDc: 12,
            }),
          },
        },
      ],
    });
    h.participants.set(caster.id, caster);
    h.participants.set(steed.id, steed);

    const result = await h.combat.resolveFaithfulSteedLifeBond(
      h.encounter.id,
      {
        casterParticipantId: caster.id,
        healingFromSpell: 7,
        spellLevel: 1,
        spellSlug: "cure-wounds",
        ownerUserId: "dm-1",
      },
    );

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (!result.ok) return;
    expect(result.value).toEqual(
      expect.objectContaining({
        steedParticipantId: steed.id,
        mirroredHealing: 7,
        healingApplied: 7,
        hpAfter: 15,
      }),
    );
    expect(steed.currentHp).toBe(15);
  });

  it("persiste Toque Curativo quando o corcel escolhe a si mesmo", async () => {
    const h = createHarness();
    const steed = makeParticipant({
      id: "steed-self-heal",
      type: "monster",
      displayName: "Corcel Extraplanar — Camelo Celestial",
      currentHp: 10,
      maxHp: 25,
      positionX: 4,
      positionY: 4,
      monster: { slug: "warhorse", name: "Warhorse", actions: [] },
      appliedEffects: [
        {
          kind: "summon",
          refId: "find-steed-spell",
          targetParticipantId: null,
          metadata: {
            source: "find-steed-spell",
            statBlock: buildOtherworldlySteedStatBlock({
              appearance: "camel",
              creatureType: "celestial",
              slotLevel: 2,
              spellAttackBonus: 4,
              spellSaveDc: 12,
            }),
          },
        },
      ],
    });
    h.participants.set(steed.id, steed);
    h.encounter.turnOrder = [steed.id];

    const result = await h.combat.resolveOtherworldlySteedGift(
      h.encounter.id,
      {
        steedParticipantId: steed.id,
        targetParticipantId: steed.id,
        ownerUserId: "dm-1",
      },
    );

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (!result.ok) return;
    expect(result.value.healingApplied).toBeGreaterThan(0);
    expect(steed.currentHp).toBe(result.value.hpAfter);
    expect(steed.currentHp).toBeGreaterThan(10);
  });

  it("não duplica Multiataque quando também existe no bloco de ações", async () => {
    const h = createHarness();
    const dragon = makeParticipant({
      id: "dragon-1",
      type: "monster",
      displayName: "Dragon",
      monster: {
        slug: "dragon",
        name: "Dragon",
        armor_class: [{ value: 18 }],
        hit_points: 200,
        actions: [
          {
            name: "Multiattack",
            desc: "Makes two attacks.",
          },
          {
            name: "Bite",
            desc: "Melee Weapon Attack: +8 to hit, reach 5 ft.",
            attack_bonus: 8,
            damage: [
              { damage_dice: "2d10+4", damage_type: { name: "piercing" } },
            ],
          },
          {
            name: "Claw",
            desc: "Melee Weapon Attack: +8 to hit, reach 10 ft.",
            attack_bonus: 8,
            damage: [
              { damage_dice: "2d6+4", damage_type: { name: "slashing" } },
            ],
          },
        ],
        multiattack: {
          description: "One bite and one claw.",
          sequence: [
            { actionName: "Bite", count: 1 },
            { actionName: "Claw", count: 1 },
          ],
        },
      },
      faction: "enemy",
    });
    h.participants.set(dragon.id, dragon);
    h.encounter.turnOrder = [dragon.id];

    const result = await h.combat.getTurnActions(
      h.encounter.id,
      dragon.id,
      "dm-1",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.value.actions.filter(
        (action) => action.name.trim().toLowerCase() === "multiataque",
      ),
    ).toHaveLength(1);
    expect(result.value.actions[0].kind).toBe("multiattack");
    expect(result.value.actions[0].range).toContain("5");
  });

  it("informa à interface quando uma condição impede ações", async () => {
    const h = createHarness();
    const sleepingMonster = makeParticipant({
      id: "sleeping-monster",
      type: "monster",
      displayName: "Sleeping Monster",
      conditions: ["incapacitated"],
      monster: { name: "Sleeping Monster", actions: [] },
    });
    h.participants.set(sleepingMonster.id, sleepingMonster);
    h.encounter.turnOrder = [sleepingMonster.id];

    const res = await h.combat.getTurnActions(
      h.encounter.id,
      sleepingMonster.id,
      "dm-1",
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.canTakeAction).toBe(false);
    expect(res.value.actionBlockedBy).toBe("incapacitated");
  });

  it("impede ações e movimento de um PC em teste de morte", async () => {
    const h = createHarness();
    const dyingPc = makeParticipant({
      id: "dying-pc",
      type: "pc",
      characterId: "char-dying",
      currentHp: 0,
      dyingState: "dying",
      conditions: [],
      movementRemaining: 30,
    });
    h.participants.set(dyingPc.id, dyingPc);
    h.encounter.turnOrder = [dyingPc.id];

    const res = await h.combat.getTurnActions(
      h.encounter.id,
      dyingPc.id,
      "dm-1",
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.canTakeAction).toBe(false);
    expect(res.value.actionBlockedBy).toBe("dying");
    expect(res.value.canMove).toBe(false);
    expect(res.value.remainingMovement).toBe(0);
  });

  it("expõe o orçamento reservado para escapar com Freedom of Movement", async () => {
    const h = createHarness();
    const restrainedPc = makeParticipant({
      id: "restrained-with-freedom",
      type: "pc",
      characterId: "char-restrained",
      conditions: ["restrained"],
      conditionInstances: [
        {
          id: "web-restraint",
          slug: "restrained",
          source: "ability:giant-spider-web",
          sourceSpell: null,
          sourceConcentration: false,
          repeatSaveTiming: "never",
        },
      ],
      effectInstances: [
        {
          id: "freedom",
          kind: "freedom_of_movement",
          sourceSpellSlug: "freedom-of-movement",
          expiresAt: { kind: "rounds", value: 600 },
          requiresConcentration: false,
        },
      ],
      movementRemaining: 30,
    });
    h.participants.set(restrainedPc.id, restrainedPc);
    h.encounter.turnOrder = [restrainedPc.id];

    const res = await h.combat.getTurnActions(
      h.encounter.id,
      restrainedPc.id,
      "dm-1",
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.canMove).toBe(false);
    expect(res.value.remainingMovement).toBe(30);
    expect(res.value.genericActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "generic-freedom-escape",
          timing: "movement",
          movementCostFt: 5,
        }),
      ]),
    );
  });
});
