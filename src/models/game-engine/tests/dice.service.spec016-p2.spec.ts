/**
 * DiceService — Spec 016 P2 (M2) tests.
 *
 * buildDiceRollRequest computa targetD20 = max(2, dc - totalModifier),
 * resolveDiceRoll classifica verdict (success/failure/crit_success/crit_failure)
 * por kind.
 */
import { DiceService } from '../services/dice.service';

describe('DiceService — buildDiceRollRequest (Spec 016)', () => {
  let service: DiceService;

  beforeEach(() => {
    service = new DiceService();
  });

  it('computes targetD20 = dc - totalModifier', () => {
    const req = service.buildDiceRollRequest({
      kind: 'ability_check',
      ability: 'DEX',
      skill: 'Stealth',
      dc: 15,
      modifiers: [
        { label: 'Proficiency', value: 3 },
        { label: 'DEX modifier', value: 4 },
      ],
    });
    expect(req.totalModifier).toBe(7);
    expect(req.targetD20).toBe(8);
  });

  it('clamps targetD20 to min 2 (nat 1 always-fail)', () => {
    const req = service.buildDiceRollRequest({
      kind: 'ability_check',
      ability: 'DEX',
      skill: 'Stealth',
      dc: 5,
      modifiers: [{ label: 'Stealth bonus', value: 20 }],
    });
    expect(req.targetD20).toBe(2);
  });

  it('clamps targetD20 to max 30 (impossible roll)', () => {
    const req = service.buildDiceRollRequest({
      kind: 'ability_check',
      ability: 'STR',
      dc: 30,
      modifiers: [{ label: 'STR penalty', value: -5 }],
    });
    expect(req.targetD20).toBe(30);
  });

  it('generates unique rollId by default', () => {
    const a = service.buildDiceRollRequest({
      kind: 'ability_check',
      ability: 'DEX',
      dc: 10,
      modifiers: [],
    });
    const b = service.buildDiceRollRequest({
      kind: 'ability_check',
      ability: 'DEX',
      dc: 10,
      modifiers: [],
    });
    expect(a.rollId).not.toBe(b.rollId);
    expect(a.rollId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('preserves provided rollId', () => {
    const req = service.buildDiceRollRequest({
      kind: 'saving_throw',
      ability: 'CON',
      dc: 13,
      modifiers: [],
      rollId: '11111111-1111-1111-1111-111111111111',
    });
    expect(req.rollId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('defaults skill to null and advantage to normal', () => {
    const req = service.buildDiceRollRequest({
      kind: 'saving_throw',
      ability: 'WIS',
      dc: 12,
      modifiers: [],
    });
    expect(req.skill).toBeNull();
    expect(req.advantage).toBe('normal');
  });
});

describe('DiceService — resolveDiceRoll (Spec 016)', () => {
  let service: DiceService;

  beforeEach(() => {
    service = new DiceService();
  });

  it('returns success when total >= dc on ability_check', () => {
    const r = service.resolveDiceRoll({
      rollId: 'r1',
      rawD20: 14,
      totalModifier: 7,
      dc: 15,
      kind: 'ability_check',
    });
    expect(r.total).toBe(21);
    expect(r.verdict).toBe('success');
  });

  it('returns failure when total < dc on ability_check', () => {
    const r = service.resolveDiceRoll({
      rollId: 'r1',
      rawD20: 5,
      totalModifier: 2,
      dc: 15,
      kind: 'ability_check',
    });
    expect(r.verdict).toBe('failure');
  });

  it('crit_success on nat 20 attack_roll regardless of total', () => {
    const r = service.resolveDiceRoll({
      rollId: 'r1',
      rawD20: 20,
      totalModifier: 0,
      dc: 30,
      kind: 'attack_roll',
    });
    expect(r.verdict).toBe('crit_success');
  });

  it('crit_failure on nat 1 attack_roll regardless of total', () => {
    const r = service.resolveDiceRoll({
      rollId: 'r1',
      rawD20: 1,
      totalModifier: 50,
      dc: 5,
      kind: 'attack_roll',
    });
    expect(r.verdict).toBe('crit_failure');
  });

  it('preserves rawD20Disadv on advantage rolls', () => {
    const r = service.resolveDiceRoll({
      rollId: 'r1',
      rawD20: 18,
      rawD20Disadv: 5,
      totalModifier: 7,
      dc: 15,
      kind: 'ability_check',
    });
    expect(r.rawD20Disadv).toBe(5);
    expect(r.total).toBe(25);
  });

  it('death_save success when rawD20 >= 10 (DC 10 fixed)', () => {
    const r = service.resolveDiceRoll({
      rollId: 'r1',
      rawD20: 12,
      totalModifier: 0,
      dc: 10,
      kind: 'death_save',
    });
    expect(r.verdict).toBe('success');
  });

  it('death_save failure when rawD20 < 10', () => {
    const r = service.resolveDiceRoll({
      rollId: 'r1',
      rawD20: 7,
      totalModifier: 0,
      dc: 10,
      kind: 'death_save',
    });
    expect(r.verdict).toBe('failure');
  });
});
