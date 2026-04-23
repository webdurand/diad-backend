import { CombatService } from '../services/combat.service';
import { DiceService } from '../services/dice.service';
import { ConditionEffectsService } from '../services/condition-effects.service';
import { MonsterActionResolver } from '../services/monster-action-resolver.service';

/**
 * Unit tests for US13 (005-encounter-polish-and-observability) — bucketing
 * of turn actions: ataques e multiattaques ficam em `actions[]`; as 8 ações
 * genéricas PHB (Dodge/Dash/Disengage/Help/Hide/Ready/Search/Use Object)
 * ficam em `genericActions[]` separado.
 *
 * Bug reportado: a aba "Atacar" misturava genéricas com ataques reais,
 * pois `getTurnActions` devolvia `actions: [...attacks, ...genericActions]`.
 */

function makeParticipant(overrides: Record<string, any> = {}): any {
  return {
    id: 'p-' + Math.random().toString(36).slice(2, 8),
    type: 'pc',
    encounterId: 'enc-1',
    displayName: 'Eilwen',
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
          name: 'Cajado',
          toHit: 2,
          damage: '1d6',
          damageType: 'bludgeoning',
          range: '5 ft.',
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
  const sessionService: any = { getById: jest.fn(async () => ({ campaignId: null })) };
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
  );

  return { combat, participants, encounter };
}

const PHB_GENERIC_ORDER = [
  'Esquivar',
  'Disparada',
  'Desengajar',
  'Ajudar',
  'Esconder',
  'Preparar',
  'Procurar',
  'Usar Objeto',
];

describe('CombatService.getTurnActions — US13 bucketing (Spec 005)', () => {
  it('mantém actions[] sem entradas de source==="generic" para PC', async () => {
    const h = createHarness();
    const pc = makeParticipant({ id: 'pc-1', characterId: 'char-1' });
    h.participants.set(pc.id, pc);
    h.encounter.turnOrder = [pc.id];

    const res = await h.combat.getTurnActions(h.encounter.id, pc.id, 'dm-1');

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const genericInActions = res.value.actions.filter((a) => a.source === 'generic');
    expect(genericInActions).toHaveLength(0);
  });

  it('popula genericActions[] com as 8 ações PHB canônicas em ordem', async () => {
    const h = createHarness();
    const pc = makeParticipant({ id: 'pc-2', characterId: 'char-2' });
    h.participants.set(pc.id, pc);
    h.encounter.turnOrder = [pc.id];

    const res = await h.combat.getTurnActions(h.encounter.id, pc.id, 'dm-1');

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.genericActions).toBeDefined();
    expect(res.value.genericActions).toHaveLength(8);
    expect(res.value.genericActions!.map((a) => a.name)).toEqual(PHB_GENERIC_ORDER);

    for (const action of res.value.genericActions!) {
      expect(action.source).toBe('generic');
      expect(action.sourceLabel).toBe('Ação PHB');
      expect(action.timing).toBe('action');
    }
  });

  it('funciona também para monstro (genericActions disponíveis a todo participante)', async () => {
    const h = createHarness();
    const goblin = makeParticipant({
      id: 'gob-1',
      type: 'monster',
      displayName: 'Goblin 1',
      monster: {
        name: 'Goblin',
        armor_class: [{ value: 15 }],
        hit_points: 7,
        actions: [
          {
            name: 'Cimitarra',
            desc: '+4 to hit',
            attack_bonus: 4,
            damage: [{ damage_dice: '1d6+2', damage_type: { name: 'slashing' } }],
          },
        ],
        multiattack: null,
      },
      faction: 'enemy',
    });
    h.participants.set(goblin.id, goblin);
    h.encounter.turnOrder = [goblin.id];

    const res = await h.combat.getTurnActions(h.encounter.id, goblin.id, 'dm-1');

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.genericActions).toHaveLength(8);
    expect(res.value.actions.every((a) => a.source !== 'generic')).toBe(true);
  });
});
