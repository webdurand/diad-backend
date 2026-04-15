import { CombatService } from '../services/combat.service';
import { DiceService } from '../services/dice.service';
import { ConditionEffectsService } from '../services/condition-effects.service';

/**
 * Unit tests for US1 (002-encounter-correctness) — death save flow.
 *
 * Covers transitions:
 *   applyDamage (HP>0 → 0)       → dyingState='dying', fell_unconscious
 *   applyDamage (HP=0 → instant) → dyingState='dead'
 *   applyDamage (already dying)  → +1 failure (+2 crit)
 *   applyHealing (dying/stable)  → dyingState='none', deathSavesReset
 *   resolveDeathSave (nat 20)    → revive, dyingState='none'
 *   resolveDeathSave (nat 1)     → +2 failures
 *   resolveDeathSave (≥10)       → +1 success; 3 successes → stable
 *   resolveDeathSave (<10)       → +1 failure; 3 failures → dead
 *   resolveDeathSave (not dying) → NOT_DYING error
 *   endTurn                      → skips dead, delivers to dying, auto-skips stable
 */

type MockParticipant = {
  id: string;
  type: 'pc' | 'monster' | 'npc';
  characterId?: string;
  monsterId?: string;
  encounterId: string;
  displayName: string;
  currentHp?: number;
  maxHp?: number;
  tempHp: number;
  conditions: string[];
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
  dyingState: 'none' | 'dying' | 'stable' | 'dead';
  faction: 'ally' | 'enemy' | 'neutral';
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

function makeParticipant(overrides: Partial<MockParticipant> = {}): MockParticipant {
  return {
    id: 'p-' + Math.random().toString(36).slice(2, 8),
    type: 'pc',
    characterId: 'char-1',
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
  const participants = new Map<string, MockParticipant>();
  const encounter: MockEncounter = {
    id: 'enc-1',
    sessionId: 'sess-1',
    status: 'active',
    turnOrder: [],
    currentTurnIndex: 0,
    currentRound: 1,
  };

  const deathSavesByChar: Record<string, { successes: number; failures: number }> = {};
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
    resolveCharacterOwner: jest.fn(async (_cid: string, fallback: string) => fallback),
  };

  const eventService: any = {
    emit: jest.fn(async () => undefined),
  };

  const stateService: any = {
    updateHp: jest.fn(async (_uid: string, cid: string, dto: { damage?: number; healing?: number }) => {
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
      const instantDeath = dto.damage !== undefined && dto.damage >= row.max * 2;
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
    }),
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
    computeSheet: jest.fn(async () => ({ armorClass: 14 })),
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
  const monsterActionResolver: any = {
    resolve: jest.fn(),
    resolveByName: jest.fn(() => null),
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
    { listActions: async () => [], resolveSlug: async () => null, listAvailableSlugs: async () => [] } as any,
  );

  return {
    combat,
    participants,
    encounter,
    hpByChar,
    deathSavesByChar,
    stateService,
    eventService,
    diceService,
  };
}

describe('CombatService — US1 death-save flow', () => {
  describe('applyDamage', () => {
    it('transitions PC from none → dying when HP hits 0', async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: 'pc-1', characterId: 'char-1' });
      h.participants.set(pc.id, pc);
      h.hpByChar['char-1'] = { current: 5, max: 10 };

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 5,
        damageType: 'slashing',
        ownerUserId: 'u1',
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.hpAfter).toBe(0);
      expect(res.value.dyingState).toBe('dying');
      expect(res.value.instantDeath).toBe(false);
      expect(pc.dyingState).toBe('dying');
      expect(pc.isDefeated).toBe(false);
      expect(res.events.some((e) => e.event_type === 'fell_unconscious')).toBe(true);
    });

    it('transitions directly to dead on massive damage (instantDeath)', async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: 'pc-2', characterId: 'char-2' });
      h.participants.set(pc.id, pc);
      h.hpByChar['char-2'] = { current: 5, max: 10 };

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 25,
        damageType: 'slashing',
        ownerUserId: 'u1',
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.dyingState).toBe('dead');
      expect(res.value.instantDeath).toBe(true);
      expect(pc.dyingState).toBe('dead');
      expect(pc.isDefeated).toBe(true);
      expect(res.events.some((e) => e.event_type === 'instant_death')).toBe(true);
    });

    it('adds 1 death-save failure when PC already dying takes damage', async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: 'pc-3', characterId: 'char-3', dyingState: 'dying' });
      h.participants.set(pc.id, pc);
      h.hpByChar['char-3'] = { current: 0, max: 10 };
      h.deathSavesByChar['char-3'] = { successes: 0, failures: 0 };

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 3,
        damageType: 'slashing',
        ownerUserId: 'u1',
      });

      expect(res.ok).toBe(true);
      expect(h.deathSavesByChar['char-3'].failures).toBe(1);
      expect(pc.dyingState).toBe('dying');
    });

    it('adds 2 death-save failures on critical hit to dying PC', async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: 'pc-4', characterId: 'char-4', dyingState: 'dying' });
      h.participants.set(pc.id, pc);
      h.hpByChar['char-4'] = { current: 0, max: 10 };
      h.deathSavesByChar['char-4'] = { successes: 0, failures: 0 };

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 8,
        damageType: 'slashing',
        ownerUserId: 'u1',
        fromCriticalHit: true,
      });

      expect(res.ok).toBe(true);
      expect(h.deathSavesByChar['char-4'].failures).toBe(2);
      expect(pc.dyingState).toBe('dying');
    });

    it('transitions dying → dead when failures reach 3', async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: 'pc-5', characterId: 'char-5', dyingState: 'dying' });
      h.participants.set(pc.id, pc);
      h.hpByChar['char-5'] = { current: 0, max: 10 };
      h.deathSavesByChar['char-5'] = { successes: 0, failures: 2 };

      const res = await h.combat.applyDamage(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 1,
        damageType: 'slashing',
        ownerUserId: 'u1',
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.dyingState).toBe('dead');
      expect(pc.dyingState).toBe('dead');
      expect(pc.isDefeated).toBe(true);
    });
  });

  describe('applyHealing', () => {
    it('resets dying PC to none and zeroes death saves', async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: 'pc-6', characterId: 'char-6', dyingState: 'dying' });
      h.participants.set(pc.id, pc);
      h.hpByChar['char-6'] = { current: 0, max: 10 };
      h.deathSavesByChar['char-6'] = { successes: 1, failures: 1 };

      const res = await h.combat.applyHealing(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 5,
        ownerUserId: 'u1',
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.hpAfter).toBe(5);
      expect(res.value.dyingState).toBe('none');
      expect(res.value.deathSavesReset).toBe(true);
      expect(pc.dyingState).toBe('none');
      expect(h.deathSavesByChar['char-6']).toEqual({ successes: 0, failures: 0 });
    });

    it('refuses to heal a dead PC', async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: 'pc-7', characterId: 'char-7', dyingState: 'dead' });
      h.participants.set(pc.id, pc);

      const res = await h.combat.applyHealing(h.encounter.id, {
        targetParticipantId: pc.id,
        amount: 10,
        ownerUserId: 'u1',
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe('ALREADY_DEAD');
    });
  });

  describe('resolveDeathSave', () => {
    it('rejects when participant is not dying', async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: 'pc-8', characterId: 'char-8', dyingState: 'none' });
      h.participants.set(pc.id, pc);

      const res = await h.combat.resolveDeathSave(h.encounter.id, pc.id, 'u1');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe('NOT_DYING');
    });

    it('rejects when participant is a monster', async () => {
      const h = createHarness();
      const m = makeParticipant({
        id: 'm-1',
        type: 'monster',
        characterId: undefined,
        monsterId: 'mon-1',
      });
      h.participants.set(m.id, m);

      const res = await h.combat.resolveDeathSave(h.encounter.id, m.id, 'u1');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.code).toBe('INVALID_PARTICIPANT');
    });

    it('natural 20 revives PC with 1 HP and zeroes death saves', async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: 'pc-9', characterId: 'char-9', dyingState: 'dying' });
      h.participants.set(pc.id, pc);
      h.deathSavesByChar['char-9'] = { successes: 0, failures: 1 };
      jest.spyOn(h.diceService, 'roll').mockReturnValueOnce(20);

      const res = await h.combat.resolveDeathSave(h.encounter.id, pc.id, 'u1');

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.roll).toBe(20);
      expect(res.value.naturalTwenty).toBe(true);
      expect(res.value.revivedHp).toBe(1);
      expect(res.value.dyingState).toBe('none');
      expect(pc.dyingState).toBe('none');
      expect(pc.isDefeated).toBe(false);
    });

    it('natural 1 counts as two failures', async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: 'pc-10', characterId: 'char-10', dyingState: 'dying' });
      h.participants.set(pc.id, pc);
      h.deathSavesByChar['char-10'] = { successes: 0, failures: 0 };
      jest.spyOn(h.diceService, 'roll').mockReturnValueOnce(1);

      const res = await h.combat.resolveDeathSave(h.encounter.id, pc.id, 'u1');

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.naturalOne).toBe(true);
      expect(res.value.failures).toBe(2);
      expect(res.value.dyingState).toBe('dying');
    });

    it('third successful save stabilizes PC', async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: 'pc-11', characterId: 'char-11', dyingState: 'dying' });
      h.participants.set(pc.id, pc);
      h.deathSavesByChar['char-11'] = { successes: 2, failures: 1 };
      jest.spyOn(h.diceService, 'roll').mockReturnValueOnce(15);

      const res = await h.combat.resolveDeathSave(h.encounter.id, pc.id, 'u1');

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.successes).toBe(3);
      expect(res.value.stabilized).toBe(true);
      expect(res.value.dyingState).toBe('stable');
      expect(pc.dyingState).toBe('stable');
    });

    it('third failure marks PC dead', async () => {
      const h = createHarness();
      const pc = makeParticipant({ id: 'pc-12', characterId: 'char-12', dyingState: 'dying' });
      h.participants.set(pc.id, pc);
      h.deathSavesByChar['char-12'] = { successes: 0, failures: 2 };
      jest.spyOn(h.diceService, 'roll').mockReturnValueOnce(5);

      const res = await h.combat.resolveDeathSave(h.encounter.id, pc.id, 'u1');

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.failures).toBe(3);
      expect(res.value.dead).toBe(true);
      expect(res.value.dyingState).toBe('dead');
      expect(pc.dyingState).toBe('dead');
      expect(pc.isDefeated).toBe(true);
    });
  });

  describe('endTurn', () => {
    it('delivers turn to a dying PC (not skipped)', async () => {
      const h = createHarness();
      const actor = makeParticipant({ id: 'a', type: 'monster' });
      const dying = makeParticipant({ id: 'b', characterId: 'cb', dyingState: 'dying' });
      h.participants.set(actor.id, actor);
      h.participants.set(dying.id, dying);
      h.encounter.turnOrder = [actor.id, dying.id];
      h.encounter.currentTurnIndex = 0;

      const res = await h.combat.endTurn(h.encounter.id);

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.participantId).toBe(dying.id);
      expect(res.value.dyingState).toBe('dying');
      expect(res.value.autoSkip).toBeFalsy();
    });

    it('marks autoSkip when turn lands on stable PC', async () => {
      const h = createHarness();
      const actor = makeParticipant({ id: 'a2', type: 'monster' });
      const stable = makeParticipant({ id: 'b2', characterId: 'cb2', dyingState: 'stable' });
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

    it('skips dead PC in turn rotation', async () => {
      const h = createHarness();
      const actor = makeParticipant({ id: 'a3', type: 'monster' });
      const dead = makeParticipant({ id: 'b3', characterId: 'cb3', dyingState: 'dead', isDefeated: true });
      const alive = makeParticipant({ id: 'c3', characterId: 'cc3' });
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

    it('removes dead PC from turnOrder at round boundary', async () => {
      const h = createHarness();
      const monster = makeParticipant({ id: 'a4', type: 'monster' });
      const dead = makeParticipant({ id: 'b4', characterId: 'cb4', dyingState: 'dead', isDefeated: true });
      const alive = makeParticipant({ id: 'c4', characterId: 'cc4' });
      h.participants.set(monster.id, monster);
      h.participants.set(dead.id, dead);
      h.participants.set(alive.id, alive);
      h.encounter.turnOrder = [monster.id, dead.id, alive.id];
      h.encounter.currentTurnIndex = 2; // end of round — next is wrap-around

      const res = await h.combat.endTurn(h.encounter.id);

      expect(res.ok).toBe(true);
      expect(h.encounter.turnOrder).toEqual([monster.id, alive.id]);
    });
  });
});
