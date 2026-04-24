import { CombatService, AttackDto } from '../services/combat.service';
import { DiceService } from '../services/dice.service';
import { ConditionEffectsService } from '../services/condition-effects.service';
import { MonsterActionResolver } from '../services/monster-action-resolver.service';

/**
 * Unit tests for US2 (002-encounter-correctness) — monster multiattack.
 *
 * Covers:
 *   - Owlbear: 1 Beak + 1 Claws → 2 sub-attacks, action consumed once
 *   - targetParticipantIds length mismatch → INVALID_PAYLOAD
 *   - Monster without multiattack → INVALID_MULTIATTACK
 *   - Target defeated mid-sequence → interruptedAt populated
 */

function makeParticipant(overrides: Record<string, any> = {}): any {
  return {
    id: 'p-' + Math.random().toString(36).slice(2, 8),
    type: 'pc',
    encounterId: 'enc-1',
    displayName: 'Thorin',
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
    dyingState: 'none',
    faction: 'ally',
    spellSlotsUsed: {},
    ...overrides,
  };
}

function createHarness() {
  const participants = new Map<string, any>();
  const encounter = {
    id: 'enc-1',
    sessionId: 'sess-1',
    status: 'active',
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
    findOne: jest.fn(async ({ where: { id } }: any) => participants.get(id) ?? null),
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
    updateHp: jest.fn(async (_uid: string, cid: string, dto: { damage?: number }) => {
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
    }),
    updateDeathSaves: jest.fn(async () => ({
      successes: 0,
      failures: 0,
      stabilized: false,
      dead: false,
    })),
  };
  const sheetService: any = { computeSheet: jest.fn(async () => ({ armorClass: 14 })) };
  const actionsService: any = { getActions: jest.fn(async () => ({ actions: [], bonusActions: [] })) };
  const sessionService: any = { getById: jest.fn(async () => ({ campaignId: null })) };
  const movementService: any = { initializeTurn: jest.fn(async () => undefined) };
  const savingThrowService: any = { resolveAbilitySave: jest.fn(async () => ({ total: 10, success: true })) };

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
    { listActions: async () => [], resolveSlug: async () => null, listAvailableSlugs: async () => [] } as any,
    { applyCondition: async () => ({ events: [], instance: {} as any, concentrationBroken: false }), removeConditionInstance: async () => ({ events: [], removed: false }) } as any,
    { addEffect: async () => ({ effect: {} as any, events: [] }), removeEffect: async () => ({ removed: false, events: [] }), removeAllByConcentrationBreak: async () => ({ events: [] }), tickAtEndOfTurn: async () => ({ events: [], ticked: [], expired: [] }) } as any,
    { startNew: async () => ({ events: [], broken: false }), break: async () => ({ events: [] }), breakDueToDeath: async () => ({ events: [] }), trackAppliedEffect: async () => {}, checkBreakOnCondition: async () => ({ events: [], broken: false }), decrementDurationFor: async () => ({ events: [] }) } as any,
    { resolveInvocation: async () => ({ resolved: false, events: [] }) } as any,
    { consumeIfArmed: async () => ({ consumed: false }) } as any,
    { resolveOnHit: async () => ({ applied: [], extraDamage: 0, events: [] }), resolveOnMiss: () => ({ events: [] }) } as any,
    { resolveAttackModifiers: () => ({ attackBonus: 0, damageBonus: 0, rerollLowDamage: false }), resolveAcBonus: () => 0, applyRerollLowDamage: (r: number[]) => ({ rolls: r, total: r.reduce((s, v) => s + v, 0), rerolled: false }) } as any,
    { applyDamageToForm: async () => ({ absorbedByForm: 0, overflowToOriginal: 0, reverted: false }), isTransformed: () => false, getActiveForm: () => null, enterForm: async () => ({}), revertForm: async () => ({}), getEffectiveSpeed: () => null, getEffectiveAc: () => null, getEffectiveActions: () => null } as any,
    { consumeBardicInspirationIfPresent: async () => ({ consumed: false, bonus: 0, events: [] }), grantBardicInspiration: async () => ({ events: [], dieSize: 6 }), getBardicInspirationDie: () => 6 } as any,
    { getModifiers: () => ({ disadvAbility: false, disadvAttack: false, disadvSave: false, speedMultiplier: 1, speedPenaltyFt: 0, maxHpMultiplier: 1, dead: false, d20Penalty: 0 }), getLevelFromInstances: () => 0 } as any,
    { runStartOfCombat: async () => ({ events: [] }), eldritchMaster: async () => ({ ok: false, code: 'TEST_STUB', events: [] }) } as any,
    { shouldOfferShield: async () => null } as any,
  );

  return { combat, participants, encounter, hpByChar, diceService };
}

describe('CombatService — US2 multiattack', () => {
  it('executes two sub-attacks for owlbear multiattack, consumes action once', async () => {
    const h = createHarness();
    const owlbear = makeParticipant({
      id: 'ob-1',
      type: 'monster',
      monster: {
        name: 'Owlbear',
        armor_class: [{ value: 13 }],
        actions: [
          { name: 'Multiattack', desc: 'The owlbear makes two attacks: one with its beak and one with its claws.' },
          { name: 'Beak', desc: '+7 to hit', attack_bonus: 7, damage: [{ damage_dice: '1d10', damage_type: { name: 'piercing' } }] },
          { name: 'Claws', desc: '+7 to hit', attack_bonus: 7, damage: [{ damage_dice: '2d8', damage_type: { name: 'slashing' } }] },
        ],
        multiattack: {
          sequence: [
            { actionName: 'Beak', count: 1 },
            { actionName: 'Claws', count: 1 },
          ],
          description: 'The owlbear makes two attacks...',
        },
      },
      faction: 'enemy',
    });
    const pc = makeParticipant({ id: 'pc-1', characterId: 'char-1' });
    h.participants.set(owlbear.id, owlbear);
    h.participants.set(pc.id, pc);
    h.encounter.turnOrder = [owlbear.id, pc.id];
    h.encounter.currentTurnIndex = 0;
    h.hpByChar['char-1'] = { current: 50, max: 50 };

    const dto: AttackDto = {
      attackerParticipantId: owlbear.id,
      targetParticipantId: pc.id,
      targetParticipantIds: [pc.id, pc.id],
      actionName: 'Multiattack',
      ownerUserId: 'dm-1',
    };

    const res = await h.combat.resolveMultiattack(h.encounter.id, dto);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.kind).toBe('multiattack');
    expect(res.value.actionConsumed).toBe(true);
    expect(res.value.subAttacks.length).toBe(2);
    expect(res.value.subAttacks[0].subActionName).toBe('Beak');
    expect(res.value.subAttacks[1].subActionName).toBe('Claws');
    expect(owlbear.actionUsed).toBe(true);
  });

  it('returns INVALID_PAYLOAD when targetParticipantIds count mismatches expected', async () => {
    const h = createHarness();
    const owlbear = makeParticipant({
      id: 'ob-2',
      type: 'monster',
      monster: {
        name: 'Owlbear',
        armor_class: [{ value: 13 }],
        actions: [],
        multiattack: {
          sequence: [
            { actionName: 'Beak', count: 1 },
            { actionName: 'Claws', count: 1 },
          ],
          description: 'The owlbear makes two attacks...',
        },
      },
    });
    const pc = makeParticipant({ id: 'pc-2', characterId: 'char-2' });
    h.participants.set(owlbear.id, owlbear);
    h.participants.set(pc.id, pc);
    h.encounter.turnOrder = [owlbear.id, pc.id];

    const dto: AttackDto = {
      attackerParticipantId: owlbear.id,
      targetParticipantId: pc.id,
      targetParticipantIds: [pc.id], // Only 1 target for a 2-target multiattack
      actionName: 'Multiattack',
      ownerUserId: 'dm-1',
    };

    const res = await h.combat.resolveMultiattack(h.encounter.id, dto);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('INVALID_PAYLOAD');
    expect(owlbear.actionUsed).toBe(false);
  });

  it('returns INVALID_MULTIATTACK when monster has no multiattack populated', async () => {
    const h = createHarness();
    const goblin = makeParticipant({
      id: 'gob-1',
      type: 'monster',
      monster: {
        name: 'Goblin',
        armor_class: [{ value: 15 }],
        actions: [],
        multiattack: null,
      },
    });
    const pc = makeParticipant({ id: 'pc-3', characterId: 'char-3' });
    h.participants.set(goblin.id, goblin);
    h.participants.set(pc.id, pc);
    h.encounter.turnOrder = [goblin.id, pc.id];

    const dto: AttackDto = {
      attackerParticipantId: goblin.id,
      targetParticipantId: pc.id,
      targetParticipantIds: [pc.id],
      actionName: 'Multiattack',
      ownerUserId: 'dm-1',
    };

    const res = await h.combat.resolveMultiattack(h.encounter.id, dto);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('INVALID_MULTIATTACK');
  });

  it('interrupts sequence when a target is defeated before its sub-attack', async () => {
    const h = createHarness();
    const owlbear = makeParticipant({
      id: 'ob-3',
      type: 'monster',
      monster: {
        name: 'Owlbear',
        armor_class: [{ value: 13 }],
        actions: [
          { name: 'Beak', desc: '+7 to hit', attack_bonus: 7, damage: [{ damage_dice: '1d10', damage_type: { name: 'piercing' } }] },
          { name: 'Claws', desc: '+7 to hit', attack_bonus: 7, damage: [{ damage_dice: '2d8', damage_type: { name: 'slashing' } }] },
        ],
        multiattack: {
          sequence: [
            { actionName: 'Beak', count: 1 },
            { actionName: 'Claws', count: 1 },
          ],
          description: '',
        },
      },
    });
    const dead = makeParticipant({ id: 'pc-dead', characterId: 'char-d', isDefeated: true });
    const alive = makeParticipant({ id: 'pc-alive', characterId: 'char-a' });
    h.participants.set(owlbear.id, owlbear);
    h.participants.set(dead.id, dead);
    h.participants.set(alive.id, alive);
    h.encounter.turnOrder = [owlbear.id, dead.id, alive.id];

    const dto: AttackDto = {
      attackerParticipantId: owlbear.id,
      targetParticipantId: dead.id,
      targetParticipantIds: [dead.id, alive.id],
      actionName: 'Multiattack',
      ownerUserId: 'dm-1',
    };

    const res = await h.combat.resolveMultiattack(h.encounter.id, dto);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.interruptedAt).toEqual({ index: 0, reason: 'target_defeated' });
    expect(res.value.subAttacks.length).toBe(0);
    expect(owlbear.actionUsed).toBe(true);
  });
});
