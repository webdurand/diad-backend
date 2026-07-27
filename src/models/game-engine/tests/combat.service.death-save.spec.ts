import { CombatService } from "../services/combat.service";
import { DiceService } from "../services/dice.service";
import { ConditionEffectsService } from "../services/condition-effects.service";
import { MonsterActionResolver } from "../services/monster-action-resolver.service";



type MockParticipant = {
  id: string;
  type: "pc" | "monster" | "npc";
  characterId?: string;
  monsterId?: string;
  encounterId: string;
  displayName: string;
  currentHp?: number;
  maxHp?: number;
  tempHp: number;
  conditions: string[];
  effectInstances?: any[];
  isConcentrating: boolean;
  concentratingOn?: string;
  legendaryActionsUsed: number;
  reactionsUsed: number;
  movementRemaining?: number;
  actionUsed: boolean;
  bonusActionUsed: boolean;
  hasDashed: boolean;
  hasDisengaged: boolean;
  positionX?: number;
  positionY?: number;
  isVisible: boolean;
  isDefeated: boolean;
  dyingState: "none" | "dying" | "stable" | "dead";
  faction: "ally" | "enemy" | "neutral";
  monster?: any;
  spellSlotsUsed: any;
  initiativeRoll?: number;
  initiativeModifier?: number;
  initiativeTotal?: number;
};

type MockEncounter = {
  id: string;
  sessionId: string;
  status: string;
  turnOrder: string[];
  currentTurnIndex: number;
  currentRound: number;
};

function makeParticipant(
  overrides: Partial<MockParticipant> = {},
): MockParticipant {
  return {
    id: "p-" + Math.random().toString(36).slice(2, 8),
    type: "pc",
    characterId: "char-1",
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
    ...overrides,
  };
}

function createHarness() {
  const participants = new Map<string, MockParticipant>();
  const encounter: MockEncounter = {
    id: "enc-1",
    sessionId: "sess-1",
    status: "active",
    turnOrder: [],
    currentTurnIndex: 0,
    currentRound: 1,
  };

  const deathSavesByChar: Record<
    string,
    { successes: number; failures: number }
  > = {};
  const hpByChar: Record<string, { current: number; max: number }> = {};
  const featureUsesByChar: Record<string, Record<string, number>> = {};

  const encounterRepo: any = {
    findOne: jest.fn(async () => encounter),
    save: jest.fn(async (e: any) => e),
  };

  const participantRepo: any = {
    find: jest.fn(async ({ where }: any) =>
      [...participants.values()].filter((participant) =>
        Object.entries(where ?? {}).every(
          ([key, value]) => participant[key as keyof MockParticipant] === value,
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
    resolveCharacterOwner: jest.fn(
      async (_cid: string, fallback: string) => fallback,
    ),
  };

  const eventService: any = {
    emit: jest.fn(async () => []),
  };

  const stateService: any = {
    getCurrentHp: jest.fn(
      async (cid: string) => hpByChar[cid]?.current ?? null,
    ),
    getFeatureUsesUsed: jest.fn(
      async (cid: string) => featureUsesByChar[cid] ?? {},
    ),
    updateHp: jest.fn(
      async (
        _uid: string,
        cid: string,
        dto: { damage?: number; healing?: number },
      ) => {
        const row = hpByChar[cid] ?? { current: 10, max: 10 };
        if (dto.damage !== undefined) {
          row.current = Math.max(0, row.current - dto.damage);
        }
        if (dto.healing !== undefined) {
          row.current = Math.min(row.max, row.current + dto.healing);
          if (row.current > 0) {
            deathSavesByChar[cid] = { successes: 0, failures: 0 };
          }
        }
        hpByChar[cid] = row;
        const instantDeath =
          dto.damage !== undefined && dto.damage >= row.max * 2;
        const isDown = row.current === 0 && !instantDeath;
        const ds = deathSavesByChar[cid] ?? { successes: 0, failures: 0 };
        return {
          currentHp: row.current,
          tempHp: 0,
          maxHp: row.max,
          isDown,
          instantDeath,
          deathSaves: ds,
        };
      },
    ),
    updateDeathSaves: jest.fn(async (_uid: string, cid: string, dto: any) => {
      const ds = deathSavesByChar[cid] ?? { successes: 0, failures: 0 };
      let revivedHp: number | undefined;
      if (dto.reset) {
        ds.successes = 0;
        ds.failures = 0;
      } else if (dto.failuresDelta) {
        ds.failures = Math.min(3, ds.failures + dto.failuresDelta);
      } else if (dto.rollValue === 20) {
        ds.successes = 0;
        ds.failures = 0;
        revivedHp = 1;
        hpByChar[cid] = { current: 1, max: hpByChar[cid]?.max ?? 10 };
      } else if (dto.rollValue === 1) {
        ds.failures = Math.min(3, ds.failures + 2);
      } else if (dto.rollValue !== undefined && dto.rollValue >= 10) {
        ds.successes = Math.min(3, ds.successes + 1);
      } else if (dto.rollValue !== undefined) {
        ds.failures = Math.min(3, ds.failures + 1);
      }
      deathSavesByChar[cid] = ds;
      return {
        successes: ds.successes,
        failures: ds.failures,
        stabilized: ds.successes >= 3,
        dead: ds.failures >= 3,
        revivedHp,
      };
    }),
  };

  const movementService: any = {
    initializeTurn: jest.fn(async () => undefined),
  };

  const sheetService: any = {
    computeSheet: jest.fn(async () => ({
      armorClass: 14,
      race: { slug: "human", name: "Human" },
      classes: [],
    })),
  };

  const actionsService: any = {
    getActions: jest.fn(async () => ({ actions: [], bonusActions: [] })),
  };

  const sessionService: any = {
    getById: jest.fn(async () => ({ campaignId: null })),
  };

  const savingThrowService: any = {
    resolveAbilitySave: jest.fn(async () => ({ total: 10, success: true })),
  };

  const diceService = new DiceService();
  const conditionEffects = new ConditionEffectsService();
  const monsterActionResolver = new MonsterActionResolver();

  const encounterEndDetector: any = {
    tryAutoEnd: jest.fn(async () => null),
    detectOutcome: jest.fn(async () => null),
  };
  const startTurnOrchestrator: any = {
    run: jest.fn(async () => ({ events: [] })),
  };
  const concentration: any = {
    startNew: jest.fn(async () => ({ events: [], broken: false })),
    break: jest.fn(async () => ({ events: [] })),
    breakDueToDeath: jest.fn(async () => ({ events: [] })),
    trackAppliedEffect: jest.fn(async () => {}),
    checkBreakOnCondition: jest.fn(async () => ({
      events: [],
      broken: false,
    })),
    decrementDurationFor: jest.fn(async () => ({ events: [] })),
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
      processEndOfTurn: async () => ({ events: [] }),
      expireAtParticipantTurnEnd: async () => ({ events: [] }),
    } as any,
    {
      addEffect: async (target: any, input: any) => {
        const effect = {
          id: `effect-${(target.effectInstances ?? []).length + 1}`,
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
              target_participant_id: target.id,
              data: {
                effectId: effect.id,
                kind: effect.kind,
                sourceFeatureSlug: effect.sourceFeatureSlug,
              },
            },
          ],
        };
      },
      removeEffect: async (target: any, effectId: string) => {
        const before = target.effectInstances ?? [];
        const removed = before.some((effect: any) => effect.id === effectId);
        target.effectInstances = before.filter(
          (effect: any) => effect.id !== effectId,
        );
        participants.set(target.id, target);
        return {
          removed,
          events: removed
            ? [
                {
                  event_type: "effect_removed",
                  target_participant_id: target.id,
                  data: { effectId },
                },
              ]
            : [],
        };
      },
      removeAllByConcentrationBreak: async () => ({ events: [] }),
      tickAtEndOfTurn: async () => ({ events: [], ticked: [], expired: [] }),
      tickAtEndOfCasterTurn: async () => ({
        events: [],
        ticked: [],
        expired: [],
      }),
      expireAtParticipantTurnEnd: async () => ({
        events: [],
        expired: [],
      }),
      expireAtStartOfTurn: async () => ({ events: [] }),
    } as any,
    concentration,
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

    encounterEndDetector,
    { processRoundStart: async () => [] } as any,
    { processAfterPcTurn: async () => [] } as any,
    { tryParryAfterAttackRoll: async () => null } as any,
    startTurnOrchestrator,
    {
      resolveEndTurnAdjacent: async () => ({ events: [] }),
      resolveEndTurnIn: async () => ({ events: [] }),
      releaseConjureElementalTarget: async () => ({ events: [] }),
    } as any,
  );

  return {
    combat,
    participants,
    encounter,
    hpByChar,
    featureUsesByChar,
    deathSavesByChar,
    stateService,
    eventService,
    diceService,
    encounterEndDetector,
    startTurnOrchestrator,
    sheetService,
    concentration,
  };
}

describe("CombatService — US1 death-save flow", () => {
  describe("applyDamage", () => {
    it("transitions PC from none → dying when HP hits 0", async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: "pc-1", characterId: "char-1" });
      h.participants.set(pc.id, pc);
      h.hpByChar["char-1"] = { current: 5, max: 10 };

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 5,
        damageType: "slashing",
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.hpAfter).toBe(0);
      expect(res.value.dyingState).toBe("dying");
      expect(res.value.instantDeath).toBe(false);
      expect(pc.dyingState).toBe("dying");
      expect(pc.isDefeated).toBe(false);
      expect(res.events.some((e) => e.event_type === "fell_unconscious")).toBe(
        true,
      );
    });

    it("persists an optional Relentless Endurance opportunity for an Orc reduced to 0 HP", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "orc-relentless",
        characterId: "orc-char",
        currentHp: 5,
        isConcentrating: true,
        concentratingOn: "bless",
      });
      h.participants.set(pc.id, pc);
      h.hpByChar["orc-char"] = { current: 5, max: 10 };
      h.sheetService.computeSheet.mockResolvedValue({
        armorClass: 14,
        race: { slug: "orc", name: "Orc" },
        classes: [{ slug: "fighter", level: 1 }],
      });

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 5,
        damageType: "slashing",
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value).toMatchObject({
        hpAfter: 0,
        dyingState: "dying",
        instantDeath: false,
      });
      expect(pc.effectInstances).toContainEqual(
        expect.objectContaining({
          kind: "relentless_endurance_pending",
          sourceFeatureSlug: "relentless-endurance",
          expiresAt: { kind: "until_consumed" },
          payload: expect.objectContaining({
            hpBefore: 5,
            hpAfter: 0,
            incomingDamage: 5,
            damageType: "slashing",
            timeoutSeconds: 20,
            decisionDeadlineAt: expect.any(String),
          }),
        }),
      );
      expect(res.events).toContainEqual(
        expect.objectContaining({
          event_type: "relentless_endurance_opportunity",
          target_participant_id: pc.id,
          data: expect.objectContaining({
            timeoutSeconds: 20,
            decisionDeadlineAt: expect.any(String),
          }),
        }),
      );
      expect(
        res.events.some((event) => event.event_type === "fell_unconscious"),
      ).toBe(false);
      expect(res.events).toContainEqual(
        expect.objectContaining({
          event_type: "concentration_check",
          target_participant_id: pc.id,
        }),
      );
    });

    it("defers unconsciousness side effects but still checks concentration on a lethal attack against an Orc", async () => {
      const h = createHarness();
      const attacker = makeParticipant({
        id: "orc-attacker",
        type: "monster",
        characterId: undefined,
        monsterId: "monster-orc-attacker",
        faction: "enemy",
        monster: {
          slug: "test-brute",
          name: "Test Brute",
          armor_class: [{ value: 12 }],
          actions: [
            {
              name: "Tap",
              attack_bonus: 100,
              damage: [
                {
                  damage_dice: "1",
                  damage_type: { name: "bludgeoning" },
                },
              ],
            },
          ],
        },
      });
      const orc = makeParticipant({
        id: "orc-concentrating",
        characterId: "orc-concentrating-char",
        currentHp: 1,
        maxHp: 10,
        isConcentrating: true,
        concentratingOn: "bless",
      });
      h.participants.set(attacker.id, attacker);
      h.participants.set(orc.id, orc);
      h.encounter.turnOrder = [attacker.id, orc.id];
      h.encounter.currentTurnIndex = 0;
      h.hpByChar[orc.characterId!] = { current: 1, max: 10 };
      h.sheetService.computeSheet.mockResolvedValue({
        armorClass: 14,
        race: { slug: "orc", name: "Orc" },
        classes: [{ slug: "fighter", level: 1 }],
        abilityScores: [{ slug: "con", modifier: 0 }],
      });
      jest.spyOn(h.diceService, "roll").mockReturnValue(10);

      const res = await h.combat.resolveAttack(h.encounter.id, {
        attackerParticipantId: attacker.id,
        targetParticipantId: orc.id,
        actionName: "Tap",
        ownerUserId: "dm-1",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value).toMatchObject({
        targetHpAfter: 0,
        targetDefeated: false,
      });
      expect(orc.effectInstances).toContainEqual(
        expect.objectContaining({ kind: "relentless_endurance_pending" }),
      );
      expect(res.events).toContainEqual(
        expect.objectContaining({
          event_type: "concentration_check",
          target_participant_id: orc.id,
        }),
      );
      expect(
        res.events.some((event) => event.event_type === "fell_unconscious"),
      ).toBe(false);
    });

    it("does not offer Relentless Endurance on instant death", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "orc-massive-damage",
        characterId: "orc-massive-char",
        currentHp: 5,
      });
      h.participants.set(pc.id, pc);
      h.hpByChar["orc-massive-char"] = { current: 5, max: 10 };
      h.sheetService.computeSheet.mockResolvedValue({
        armorClass: 14,
        race: { slug: "orc", name: "Orc" },
        classes: [{ slug: "fighter", level: 1 }],
      });

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 25,
        damageType: "slashing",
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.instantDeath).toBe(true);
      expect(
        pc.effectInstances?.some(
          (effect) => effect.kind === "relentless_endurance_pending",
        ) ?? false,
      ).toBe(false);
      expect(
        res.events.some(
          (event) =>
            event.event_type === "relentless_endurance_opportunity",
        ),
      ).toBe(false);
    });

    it("does not offer a second Relentless Endurance after its use is spent", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "orc-relentless-spent",
        characterId: "orc-spent-char",
        currentHp: 5,
      });
      h.participants.set(pc.id, pc);
      h.hpByChar["orc-spent-char"] = { current: 5, max: 10 };
      h.featureUsesByChar["orc-spent-char"] = {
        "relentless-endurance": 1,
      };
      h.sheetService.computeSheet.mockResolvedValue({
        armorClass: 14,
        race: { slug: "orc", name: "Orc" },
        classes: [{ slug: "fighter", level: 1 }],
      });

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 5,
        damageType: "slashing",
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      expect(
        pc.effectInstances?.some(
          (effect) => effect.kind === "relentless_endurance_pending",
        ) ?? false,
      ).toBe(false);
      expect(
        res.events.some(
          (event) =>
            event.event_type === "relentless_endurance_opportunity",
        ),
      ).toBe(false);
    });

    it("transitions directly to dead on massive damage (instantDeath)", async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: "pc-2", characterId: "char-2" });
      h.participants.set(pc.id, pc);
      h.hpByChar["char-2"] = { current: 5, max: 10 };

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 25,
        damageType: "slashing",
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.dyingState).toBe("dead");
      expect(res.value.instantDeath).toBe(true);
      expect(pc.dyingState).toBe("dead");
      expect(pc.isDefeated).toBe(true);
      expect(res.events.some((e) => e.event_type === "instant_death")).toBe(
        true,
      );
    });

    it("adds 1 death-save failure when PC already dying takes damage", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "pc-3",
        characterId: "char-3",
        dyingState: "dying",
      });
      h.participants.set(pc.id, pc);
      h.hpByChar["char-3"] = { current: 0, max: 10 };
      h.deathSavesByChar["char-3"] = { successes: 0, failures: 0 };

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 3,
        damageType: "slashing",
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      expect(h.deathSavesByChar["char-3"].failures).toBe(1);
      expect(pc.dyingState).toBe("dying");
    });

    it("adds 2 death-save failures on critical hit to dying PC", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "pc-4",
        characterId: "char-4",
        dyingState: "dying",
      });
      h.participants.set(pc.id, pc);
      h.hpByChar["char-4"] = { current: 0, max: 10 };
      h.deathSavesByChar["char-4"] = { successes: 0, failures: 0 };

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 8,
        damageType: "slashing",
        ownerUserId: "u1",
        fromCriticalHit: true,
      });

      expect(res.ok).toBe(true);
      expect(h.deathSavesByChar["char-4"].failures).toBe(2);
      expect(pc.dyingState).toBe("dying");
    });

    it("transitions dying → dead when failures reach 3", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "pc-5",
        characterId: "char-5",
        dyingState: "dying",
      });
      h.participants.set(pc.id, pc);
      h.hpByChar["char-5"] = { current: 0, max: 10 };
      h.deathSavesByChar["char-5"] = { successes: 0, failures: 2 };

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 1,
        damageType: "slashing",
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.dyingState).toBe("dead");
      expect(pc.dyingState).toBe("dead");
      expect(pc.isDefeated).toBe(true);
    });

    it("Evasion reduces successful Dexterity half-damage saves to zero", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "rogue-evasion-success",
        characterId: "rogue-char",
      });
      h.participants.set(pc.id, pc);
      h.hpByChar["rogue-char"] = { current: 40, max: 40 };
      h.sheetService.computeSheet.mockResolvedValue({
        armorClass: 16,
        classes: [{ slug: "rogue-xphb", level: 10 }],
      });

      const result = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 17,
        damageType: "fire",
        ownerUserId: "u1",
        savingThrow: {
          ability: "dex",
          success: true,
          halfDamageOnSuccess: true,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.damageApplied).toBe(0);
      expect(result.value.hpAfter).toBe(40);
      expect(
        result.events.find(
          (event) =>
            event.event_type === "class_feature_triggered" &&
            event.data.featureSlug === "evasion",
        )?.data,
      ).toMatchObject({
        saveSucceeded: true,
        damageBeforeEvasion: 17,
        damageAfterEvasion: 0,
      });
    });

    it("Evasion halves damage after a failed Dexterity save", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "rogue-evasion-failure",
        characterId: "rogue-char",
      });
      h.participants.set(pc.id, pc);
      h.hpByChar["rogue-char"] = { current: 40, max: 40 };
      h.sheetService.computeSheet.mockResolvedValue({
        armorClass: 16,
        classes: [{ slug: "rogue", level: 10 }],
      });

      const result = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 35,
        damageType: "fire",
        ownerUserId: "u1",
        savingThrow: {
          ability: "dex",
          success: false,
          halfDamageOnSuccess: true,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.damageApplied).toBe(17);
      expect(result.value.hpAfter).toBe(23);
      expect(
        result.events.find(
          (event) =>
            event.event_type === "class_feature_triggered" &&
            event.data.featureSlug === "evasion",
        )?.data,
      ).toMatchObject({
        saveSucceeded: false,
        damageBeforeEvasion: 35,
        damageAfterEvasion: 17,
      });
    });
  });

  describe("applyHealing", () => {
    it("resets dying PC to none and zeroes death saves", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "pc-6",
        characterId: "char-6",
        dyingState: "dying",
      });
      h.participants.set(pc.id, pc);
      h.hpByChar["char-6"] = { current: 0, max: 10 };
      h.deathSavesByChar["char-6"] = { successes: 1, failures: 1 };

      const res = await h.combat.applyHealing(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 5,
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.hpAfter).toBe(5);
      expect(res.value.dyingState).toBe("none");
      expect(res.value.deathSavesReset).toBe(true);
      expect(pc.dyingState).toBe("none");
      expect(h.deathSavesByChar["char-6"]).toEqual({
        successes: 0,
        failures: 0,
      });
    });

    it("removes a stale Relentless Endurance prompt when healing restores HP", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "orc-healed-before-choice",
        characterId: "orc-healed-char",
        currentHp: 0,
        dyingState: "dying",
        effectInstances: [
          {
            id: "pending-relentless-healed",
            kind: "relentless_endurance_pending",
            sourceFeatureSlug: "relentless-endurance",
            payload: { triggerEventId: "trigger-healed" },
          },
        ],
      });
      h.participants.set(pc.id, pc);
      h.hpByChar["orc-healed-char"] = { current: 0, max: 10 };

      const res = await h.combat.applyHealing(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 5,
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      expect(pc.currentHp).toBe(5);
      expect(pc.effectInstances).toEqual([]);
      expect(res.events).toContainEqual(
        expect.objectContaining({
          event_type: "effect_removed",
          data: expect.objectContaining({
            effectId: "pending-relentless-healed",
          }),
        }),
      );
    });

    it("refuses to heal a dead PC", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "pc-7",
        characterId: "char-7",
        dyingState: "dead",
      });
      h.participants.set(pc.id, pc);

      const res = await h.combat.applyHealing(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 10,
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("ALREADY_DEAD");
    });

    it("registra no evento somente a cura realmente aplicada no teto de PV", async () => {
      const h = createHarness();
      const monster = makeParticipant({
        id: "monster-heal-cap",
        type: "monster",
        currentHp: 9,
        maxHp: 10,
        monster: { slug: "guard", name: "Guard" },
      });
      h.participants.set(monster.id, monster);

      const res = await h.combat.applyHealing(h.encounter.id, {
        targetParticipantId: monster.id,
        amount: 5,
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.healingApplied).toBe(1);
      expect(res.events).toContainEqual(
        expect.objectContaining({
          event_type: "hp_change",
          data: expect.objectContaining({
            healing: 1,
            healingRequested: 5,
            hpAfter: 10,
          }),
        }),
      );
    });

    it("maximiza a cura recebida sob Beacon of Hope", async () => {
      const h = createHarness();
      const monster = makeParticipant({
        id: "monster-beacon-heal",
        type: "monster",
        currentHp: 2,
        maxHp: 20,
        monster: { slug: "guard", name: "Guard" },
        effectInstances: [
          {
            kind: "beacon_of_hope",
            requiresConcentration: true,
          },
        ],
      });
      h.participants.set(monster.id, monster);

      const res = await h.combat.applyHealing(h.encounter.id, {
        targetParticipantId: monster.id,
        amount: 4,
        maximumAmount: 11,
        sourceSpellSlug: "cure-wounds",
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value).toMatchObject({
        hpAfter: 13,
        healingApplied: 11,
        healingMaximized: true,
      });
      expect(res.events).toContainEqual(
        expect.objectContaining({
          event_type: "healing_maximized_by_beacon_of_hope",
          data: expect.objectContaining({
            sourceSpell: "cure-wounds",
            rolledHealing: 4,
            maximumHealing: 11,
          }),
        }),
      );
    });
  });

  describe("resolveDeathSave", () => {
    it("rejects when participant is not dying", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "pc-8",
        characterId: "char-8",
        dyingState: "none",
      });
      h.participants.set(pc.id, pc);

      const res = await h.combat.resolveDeathSave(h.encounter.id, pc.id, "u1");

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("NOT_DYING");
    });

    it("rejects when participant is a monster", async () => {
      const h = createHarness();
      const m = makeParticipant({
        id: "m-1",
        type: "monster",
        characterId: undefined,
        monsterId: "mon-1",
      });
      h.participants.set(m.id, m);

      const res = await h.combat.resolveDeathSave(h.encounter.id, m.id, "u1");

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe("INVALID_PARTICIPANT");
    });

    it("natural 20 revives PC with 1 HP and zeroes death saves", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "pc-9",
        characterId: "char-9",
        dyingState: "dying",
      });
      h.participants.set(pc.id, pc);
      h.deathSavesByChar["char-9"] = { successes: 0, failures: 1 };
      jest.spyOn(h.diceService, "roll").mockReturnValueOnce(20);

      const res = await h.combat.resolveDeathSave(h.encounter.id, pc.id, "u1");

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.roll).toBe(20);
      expect(res.value.naturalTwenty).toBe(true);
      expect(res.value.revivedHp).toBe(1);
      expect(res.value.dyingState).toBe("none");
      expect(pc.dyingState).toBe("none");
      expect(pc.isDefeated).toBe(false);
    });

    it("treats starting a death save as declining and clears pending Relentless Endurance", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "orc-death-save",
        characterId: "char-orc-death-save",
        currentHp: 0,
        dyingState: "dying",
        isConcentrating: true,
        concentratingOn: "bless",
        effectInstances: [
          {
            id: "relentless-before-death-save",
            kind: "relentless_endurance_pending",
            sourceFeatureSlug: "relentless-endurance",
            payload: { triggerEventId: "relentless-death-save-trigger" },
            expiresAt: { kind: "until_consumed" },
            requiresConcentration: false,
          },
        ],
      });
      h.participants.set(pc.id, pc);
      h.deathSavesByChar[pc.characterId!] = { successes: 0, failures: 0 };
      jest.spyOn(h.diceService, "roll").mockReturnValueOnce(12);

      const res = await h.combat.resolveDeathSave(
        h.encounter.id,
        pc.id,
        "u1",
      );

      expect(res.ok).toBe(true);
      expect(pc.effectInstances).toEqual([]);
      expect(h.concentration.break).toHaveBeenCalledWith(
        pc,
        "incapacitated",
      );
      expect(res.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event_type: "relentless_endurance_declined",
            data: expect.objectContaining({ reason: "death-save-started" }),
          }),
          expect.objectContaining({ event_type: "fell_unconscious" }),
          expect.objectContaining({ event_type: "death_save" }),
        ]),
      );
    });

    it("natural 1 counts as two failures", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "pc-10",
        characterId: "char-10",
        dyingState: "dying",
      });
      h.participants.set(pc.id, pc);
      h.deathSavesByChar["char-10"] = { successes: 0, failures: 0 };
      jest.spyOn(h.diceService, "roll").mockReturnValueOnce(1);

      const res = await h.combat.resolveDeathSave(h.encounter.id, pc.id, "u1");

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.naturalOne).toBe(true);
      expect(res.value.failures).toBe(2);
      expect(res.value.dyingState).toBe("dying");
    });

    it("third successful save stabilizes PC", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "pc-11",
        characterId: "char-11",
        dyingState: "dying",
      });
      h.participants.set(pc.id, pc);
      h.deathSavesByChar["char-11"] = { successes: 2, failures: 1 };
      jest.spyOn(h.diceService, "roll").mockReturnValueOnce(15);

      const res = await h.combat.resolveDeathSave(h.encounter.id, pc.id, "u1");

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.successes).toBe(3);
      expect(res.value.stabilized).toBe(true);
      expect(res.value.dyingState).toBe("stable");
      expect(pc.dyingState).toBe("stable");
    });

    it("third failure marks PC dead", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "pc-12",
        characterId: "char-12",
        dyingState: "dying",
      });
      h.participants.set(pc.id, pc);
      h.deathSavesByChar["char-12"] = { successes: 0, failures: 2 };
      jest.spyOn(h.diceService, "roll").mockReturnValueOnce(5);

      const res = await h.combat.resolveDeathSave(h.encounter.id, pc.id, "u1");

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.failures).toBe(3);
      expect(res.value.dead).toBe(true);
      expect(res.value.dyingState).toBe("dead");
      expect(pc.dyingState).toBe("dead");
      expect(pc.isDefeated).toBe(true);
    });

    it("rolls both d20s and keeps the higher result under Beacon of Hope", async () => {
      const h = createHarness();
      const pc = makeParticipant({
        id: "pc-beacon-death-save",
        characterId: "char-beacon-death-save",
        dyingState: "dying",
        effectInstances: [
          {
            kind: "beacon_of_hope",
            requiresConcentration: true,
          },
        ],
      });
      h.participants.set(pc.id, pc);
      h.deathSavesByChar[pc.characterId!] = {
        successes: 0,
        failures: 0,
      };
      jest.spyOn(h.diceService, "rollWithAdvantage").mockReturnValueOnce({
        roll1: 4,
        roll2: 17,
        chosen: 17,
        discarded: 4,
      });

      const res = await h.combat.resolveDeathSave(
        h.encounter.id,
        pc.id,
        "u1",
      );

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value).toMatchObject({
        roll: 17,
        hasAdvantage: true,
        advantage: {
          roll1: 4,
          roll2: 17,
          chosen: 17,
          discarded: 4,
        },
      });
      expect(res.events[0]).toMatchObject({
        event_type: "death_save",
        data: {
          sourceSpell: "beacon-of-hope",
          advantage: {
            roll1: 4,
            roll2: 17,
            chosen: 17,
          },
        },
      });
    });
  });

  describe("endTurn", () => {
    it("delivers turn to a dying PC (not skipped)", async () => {
      const h = createHarness();
      const actor = makeParticipant({ id: "a", type: "monster" });
      const dying = makeParticipant({
        id: "b",
        characterId: "cb",
        dyingState: "dying",
      });
      h.participants.set(actor.id, actor);
      h.participants.set(dying.id, dying);
      h.encounter.turnOrder = [actor.id, dying.id];
      h.encounter.currentTurnIndex = 0;

      const res = await h.combat.endTurn(h.encounter.id);

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.participantId).toBe(dying.id);
      expect(res.value.dyingState).toBe("dying");
      expect(res.value.autoSkip).toBeFalsy();
      expect(h.startTurnOrchestrator.run).toHaveBeenCalledWith(
        dying,
        expect.objectContaining({ isStartOfRound: false }),
      );
    });

    it("marks autoSkip when turn lands on stable PC", async () => {
      const h = createHarness();
      const actor = makeParticipant({ id: "a2", type: "monster" });
      const stable = makeParticipant({
        id: "b2",
        characterId: "cb2",
        dyingState: "stable",
      });
      h.participants.set(actor.id, actor);
      h.participants.set(stable.id, stable);
      h.encounter.turnOrder = [actor.id, stable.id];
      h.encounter.currentTurnIndex = 0;

      const res = await h.combat.endTurn(h.encounter.id);

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.participantId).toBe(stable.id);
      expect(res.value.autoSkip).toBe(true);
    });

    it("skips dead PC in turn rotation", async () => {
      const h = createHarness();
      const actor = makeParticipant({ id: "a3", type: "monster" });
      const dead = makeParticipant({
        id: "b3",
        characterId: "cb3",
        dyingState: "dead",
        isDefeated: true,
      });
      const alive = makeParticipant({ id: "c3", characterId: "cc3" });
      h.participants.set(actor.id, actor);
      h.participants.set(dead.id, dead);
      h.participants.set(alive.id, alive);
      h.encounter.turnOrder = [actor.id, dead.id, alive.id];
      h.encounter.currentTurnIndex = 0;

      const res = await h.combat.endTurn(h.encounter.id);

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.participantId).toBe(alive.id);
    });

    it("removes dead PC from turnOrder at round boundary", async () => {
      const h = createHarness();
      const monster = makeParticipant({ id: "a4", type: "monster" });
      const dead = makeParticipant({
        id: "b4",
        characterId: "cb4",
        dyingState: "dead",
        isDefeated: true,
      });
      const alive = makeParticipant({ id: "c4", characterId: "cc4" });
      h.participants.set(monster.id, monster);
      h.participants.set(dead.id, dead);
      h.participants.set(alive.id, alive);
      h.encounter.turnOrder = [monster.id, dead.id, alive.id];
      h.encounter.currentTurnIndex = 2;

      const res = await h.combat.endTurn(h.encounter.id);

      expect(res.ok).toBe(true);
      expect(h.encounter.turnOrder).toEqual([monster.id, alive.id]);
    });
  });

  describe("auto-end após ação de dano", () => {
    it("dispara tryAutoEnd quando applyDamage derrota o monstro", async () => {
      const h = createHarness();
      const goblin = makeParticipant({
        id: "m-auto-1",
        type: "monster",
        characterId: undefined,
        faction: "enemy",
        currentHp: 5,
        maxHp: 5,
        displayName: "Goblin",
      });
      h.participants.set(goblin.id, goblin);

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: goblin.id,
        amount: 5,
        damageType: "slashing",
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.defeated).toBe(true);
      expect(h.encounterEndDetector.tryAutoEnd).toHaveBeenCalledWith(
        h.encounter.id,
      );
    });

    it("não dispara tryAutoEnd quando o dano não derrota ninguém", async () => {
      const h = createHarness();
      const goblin = makeParticipant({
        id: "m-auto-2",
        type: "monster",
        characterId: undefined,
        faction: "enemy",
        currentHp: 10,
        maxHp: 10,
        displayName: "Goblin",
      });
      h.participants.set(goblin.id, goblin);

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: goblin.id,
        amount: 3,
        damageType: "slashing",
        ownerUserId: "u1",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.defeated).toBe(false);
      expect(h.encounterEndDetector.tryAutoEnd).not.toHaveBeenCalled();
    });
  });
});
