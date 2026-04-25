/**
 * fate-ladder-helpers — Spec 016 P4 (M3) tests.
 *
 * Pure helpers: priceTable seleção, sacrifice validation, resurrection
 * eligibility, pay-price outcome.
 */
import {
  DEFAULT_PRICE_TABLE,
  FORBIDDEN_COSTS,
  RESURRECTION_TABLE,
  buildPayPriceOutcome,
  eligibleResurrectionSpells,
  pickRandomPrice,
  validateSacrificeBounded,
} from '../services/fate-ladder-helpers';

describe('FateLadder Helpers — Resurrection table', () => {
  it('Revivify: 300gp diamond, 1min window, no penalty', () => {
    const r = RESURRECTION_TABLE.Revivify;
    expect(r.diamondGp).toBe(300);
    expect(r.timeWindowMinutes).toBe(1);
    expect(r.d20Penalty).toBe(0);
  });

  it('Raise Dead: 500gp diamond, 10 days window, -4 penalty decay', () => {
    const r = RESURRECTION_TABLE['Raise Dead'];
    expect(r.diamondGp).toBe(500);
    expect(r.timeWindowMinutes).toBe(10 * 24 * 60);
    expect(r.d20Penalty).toBe(-4);
    expect(r.decayPerLongRest).toBe(1);
  });

  it('True Resurrection: 25000gp, 200 years, no penalty', () => {
    const r = RESURRECTION_TABLE['True Resurrection'];
    expect(r.diamondGp).toBe(25000);
    expect(r.d20Penalty).toBe(0);
  });
});

describe('FateLadder Helpers — Price table', () => {
  it('default table tem ≥6 entries (spec §5)', () => {
    expect(DEFAULT_PRICE_TABLE.length).toBeGreaterThanOrEqual(6);
  });

  it('default table não inclui forbidden costs', () => {
    const kinds = DEFAULT_PRICE_TABLE.map((c) => c.kind as string);
    for (const forbidden of FORBIDDEN_COSTS) {
      expect(kinds).not.toContain(forbidden);
    }
  });

  it('weights são positivos', () => {
    for (const c of DEFAULT_PRICE_TABLE) {
      expect(c.weight).toBeGreaterThan(0);
    }
  });

  it('pickRandomPrice retorna entrada válida', () => {
    const fixed = () => 0.5;
    const cost = pickRandomPrice(DEFAULT_PRICE_TABLE, fixed);
    expect(DEFAULT_PRICE_TABLE).toContain(cost);
  });

  it('pickRandomPrice respeita weights (rng=0 sempre primeira)', () => {
    const cost = pickRandomPrice(DEFAULT_PRICE_TABLE, () => 0.0);
    expect(cost.kind).toBe(DEFAULT_PRICE_TABLE[0].kind);
  });

  it('pickRandomPrice rng=0.999 cai na última entry', () => {
    const cost = pickRandomPrice(DEFAULT_PRICE_TABLE, () => 0.999);
    expect(cost.kind).toBe(DEFAULT_PRICE_TABLE[DEFAULT_PRICE_TABLE.length - 1].kind);
  });
});

describe('FateLadder Helpers — Sacrifice validation', () => {
  it('aceita 1-2 frases coerentes', () => {
    const r = validateSacrificeBounded(
      'Lothar empurra o orc do penhasco com ele.',
    );
    expect(r.ok).toBe(true);
  });

  it('rejeita texto curto demais', () => {
    const r = validateSacrificeBounded('Morre.');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/curta/);
  });

  it('rejeita texto longo demais', () => {
    const longText = 'Lorem ipsum dolor sit amet '.repeat(20);
    const r = validateSacrificeBounded(longText);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/longa/);
  });

  it('rejeita grand claim "salvo o mundo"', () => {
    const r = validateSacrificeBounded(
      'Lothar grita uma palavra antiga e salva o mundo inteiro do mal.',
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cena atual/);
  });

  it('rejeita grand claim "derroto deus"', () => {
    const r = validateSacrificeBounded(
      'Lothar usa sua espada e derrota o deus do caos.',
    );
    expect(r.ok).toBe(false);
  });

  it('aceita feat bounded ao boss da cena', () => {
    const r = validateSacrificeBounded(
      'Lothar empurra o líder dos goblins do penhasco junto com ele.',
    );
    expect(r.ok).toBe(true);
  });
});

describe('FateLadder Helpers — Resurrection eligibility', () => {
  it('30s post-death + 300gp → Revivify only', () => {
    const eligible = eligibleResurrectionSpells({
      minutesSinceDeath: 0.5,
      diamondsAvailableGp: 300,
    });
    expect(eligible).toContain('Revivify');
  });

  it('30s post-death + 500gp → Revivify + Raise Dead', () => {
    const eligible = eligibleResurrectionSpells({
      minutesSinceDeath: 0.5,
      diamondsAvailableGp: 500,
    });
    expect(eligible).toContain('Revivify');
    expect(eligible).toContain('Raise Dead');
  });

  it('5min post-death + 300gp → NÃO Revivify (window 1min)', () => {
    const eligible = eligibleResurrectionSpells({
      minutesSinceDeath: 5,
      diamondsAvailableGp: 300,
    });
    expect(eligible).not.toContain('Revivify');
  });

  it('200gp NÃO eligible para Revivify (precisa 300)', () => {
    const eligible = eligibleResurrectionSpells({
      minutesSinceDeath: 0.5,
      diamondsAvailableGp: 200,
    });
    expect(eligible).not.toContain('Revivify');
  });

  it('25000gp + recente → todos 4 spells', () => {
    const eligible = eligibleResurrectionSpells({
      minutesSinceDeath: 0.5,
      diamondsAvailableGp: 25000,
    });
    expect(eligible).toEqual(
      expect.arrayContaining([
        'Revivify',
        'Raise Dead',
        'Resurrection',
        'True Resurrection',
      ]),
    );
  });
});

describe('FateLadder Helpers — Pay Price outcome', () => {
  it('outcome = HP 1 + stable unconscious + wakes next round', () => {
    const cost = DEFAULT_PRICE_TABLE[0];
    const out = buildPayPriceOutcome(cost);
    expect(out.hpRestored).toBe(1);
    expect(out.status).toBe('stable_unconscious');
    expect(out.wakesNextRound).toBe(true);
    expect(out.costApplied).toBe(cost);
  });
});
