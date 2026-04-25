/**
 * rest-helpers — Spec 016 P5 (M4) tests.
 *
 * Short rest (HP≥1 RAW 2024 + HD spend), long rest (full HP+HD 2024 +
 * exhaustion -1 + slots), 24h gate.
 */
import {
  CharacterRestSnapshot,
  computeLongRestDelta,
  computeShortRestDelta,
  validateLongRestGate,
  validateShortRestEligibility,
} from '../services/rest-helpers';

const baseSnapshot = (override?: Partial<CharacterRestSnapshot>): CharacterRestSnapshot => ({
  hp: 20,
  hpMax: 30,
  hitDiceAvailable: { d8: 3 },
  hitDiceMax: { d8: 5 },
  exhaustionLevel: 0,
  conModifier: 2,
  spellSlotsCurrent: { '1': 2 },
  spellSlotsMax: { '1': 4 },
  shortRestFeatures: ['Channel Divinity'],
  longRestFeatures: ['Wild Shape'],
  ...override,
});

describe('rest-helpers — validateShortRestEligibility', () => {
  it('PC com HP≥1 pode short rest', () => {
    const r = validateShortRestEligibility({ hp: 5 });
    expect(r.ok).toBe(true);
  });

  it('PC com HP=0 NÃO pode short rest (RAW 2024)', () => {
    const r = validateShortRestEligibility({ hp: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/inconsciente|RAW 2024/i);
  });

  it('PC com HP negativo bloqueado', () => {
    const r = validateShortRestEligibility({ hp: -2 });
    expect(r.ok).toBe(false);
  });
});

describe('rest-helpers — computeShortRestDelta', () => {
  it('rola HD + CON modifier, soma heal', () => {
    // RNG fixa em 0.5 → rolled = floor(0.5 * 8) + 1 = 5; +CON 2 = 7 por die
    const delta = computeShortRestDelta(
      baseSnapshot(),
      { d8: 2 },
      () => 0.5,
    );
    expect(delta.hpRolls).toHaveLength(2);
    expect(delta.hpRolls[0].rolled).toBe(5);
    expect(delta.hpRolls[0].effective).toBe(7);
    expect(delta.hpDelta).toBe(10); // 7+7=14, mas room é 30-20=10, cap em 10
    expect(delta.hdSpent).toEqual({ d8: 2 });
  });

  it('cap no hpMax', () => {
    const delta = computeShortRestDelta(
      baseSnapshot({ hp: 28, hpMax: 30 }),
      { d8: 5 },
      () => 0.99,
    );
    expect(delta.hpDelta).toBeLessThanOrEqual(2); // só 2 HP de room
  });

  it('rejeita gastar mais HD do que disponível', () => {
    const delta = computeShortRestDelta(
      baseSnapshot({ hitDiceAvailable: { d8: 1 } }),
      { d8: 3 },
      () => 0.5,
    );
    expect(delta.hdSpent).toEqual({ d8: 1 });
    expect(delta.errors[0]).toMatch(/Pediu 3.*só 1/);
  });

  it('CON negativo: heal mínimo 1 por die', () => {
    const delta = computeShortRestDelta(
      baseSnapshot({ conModifier: -3, hp: 1 }),
      { d8: 1 },
      () => 0.0, // rolled 1
    );
    // 1 + (-3) = -2 → clamp 1
    expect(delta.hpRolls[0].effective).toBe(1);
  });

  it('PC dying não pode short rest', () => {
    const delta = computeShortRestDelta(
      baseSnapshot({ hp: 0 }),
      { d8: 1 },
      () => 0.5,
    );
    expect(delta.hpDelta).toBe(0);
    expect(delta.errors[0]).toMatch(/inconsciente|RAW 2024/i);
  });

  it('restaura SR features', () => {
    const delta = computeShortRestDelta(
      baseSnapshot({ shortRestFeatures: ['Action Surge', 'Channel Divinity'] }),
      { d8: 1 },
      () => 0.5,
    );
    expect(delta.featuresRestored).toEqual(['Action Surge', 'Channel Divinity']);
  });
});

describe('rest-helpers — computeLongRestDelta', () => {
  it('full HP + full HD restore (RAW 2024 100%)', () => {
    const delta = computeLongRestDelta(baseSnapshot({ hp: 5, hpMax: 30 }));
    expect(delta.hpDelta).toBe(25);
    expect(delta.hdRestored).toEqual({ d8: 2 }); // 5 max - 3 current = 2
  });

  it('exhaustion -1', () => {
    const delta = computeLongRestDelta(baseSnapshot({ exhaustionLevel: 3 }));
    expect(delta.exhaustionFrom).toBe(3);
    expect(delta.exhaustionTo).toBe(2);
  });

  it('exhaustion não vai abaixo de 0', () => {
    const delta = computeLongRestDelta(baseSnapshot({ exhaustionLevel: 0 }));
    expect(delta.exhaustionTo).toBe(0);
  });

  it('full slot restore', () => {
    const delta = computeLongRestDelta(
      baseSnapshot({
        spellSlotsCurrent: { '1': 1, '2': 0 },
        spellSlotsMax: { '1': 4, '2': 2 },
      }),
    );
    expect(delta.slotsDelta).toEqual({ '1': 3, '2': 2 });
  });

  it('combina SR + LR features', () => {
    const delta = computeLongRestDelta(
      baseSnapshot({
        shortRestFeatures: ['Action Surge'],
        longRestFeatures: ['Wild Shape', 'Sneak Attack reset'],
      }),
    );
    expect(delta.featuresRestored).toEqual([
      'Action Surge',
      'Wild Shape',
      'Sneak Attack reset',
    ]);
  });
});

describe('rest-helpers — validateLongRestGate', () => {
  it('sem long rest anterior → ok', () => {
    const r = validateLongRestGate({});
    expect(r.ok).toBe(true);
  });

  it('última 5h atrás bloqueia (24h gate RAW)', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const r = validateLongRestGate({ lastLongRestAt: fiveHoursAgo });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Long rest disponível/);
  });

  it('última 25h atrás libera', () => {
    const past = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const r = validateLongRestGate({ lastLongRestAt: past });
    expect(r.ok).toBe(true);
    expect(r.hoursSinceLast).toBeGreaterThan(24);
  });

  it('override de minHours funciona', () => {
    const past = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const r = validateLongRestGate({
      lastLongRestAt: past,
      minHoursBetween: 4,
    });
    expect(r.ok).toBe(true);
  });
});
