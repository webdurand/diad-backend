import {
  getSpellEffectiveRange,
  type SpellEffectiveRange,
} from './spell-effective-range';

/**
 * Spec 015 Eixo 2 — desambigua semântica de `spell.range` quando "Self" pode
 * significar 3 coisas diferentes:
 *   1. Buff no caster (Mage Armor, Shield of Faith).
 *   2. Emanação AoE do caster (Burning Hands, Thunderwave).
 *   3. Origem de attack ranged/melee contra outra criatura (Produce Flame, Flame Blade).
 *
 * Pré-015: `parseRangeString("Self")` → `{normal: 0}` tratava todas as 3 como
 * "target = caster na mesma cell", causando auto-damage em Produce Flame.
 */

type SpellShape = {
  slug: string;
  range: string;
  attack_type?: 'ranged' | 'melee' | null;
  area_of_effect?: { type?: string; size?: number } | null;
};

const makeSpell = (overrides: Partial<SpellShape>): SpellShape => ({
  slug: 'test-spell',
  range: '60 feet',
  attack_type: null,
  area_of_effect: null,
  ...overrides,
});

describe('getSpellEffectiveRange', () => {
  describe('self-buff (range=Self, sem attack, sem AoE)', () => {
    it('Mage Armor: buff no caster', () => {
      const result = getSpellEffectiveRange(
        makeSpell({ slug: 'mage-armor', range: 'Self' }),
      );
      expect(result.kind).toBe('self-buff');
      expect(result.attackRangeFt).toBeNull();
      expect(result.aoeShape).toBeNull();
    });

    it('Shield of Faith: targeta outro (range=60ft), não self-buff', () => {
      const result = getSpellEffectiveRange(
        makeSpell({ slug: 'shield-of-faith', range: '60 feet' }),
      );
      expect(result.kind).toBe('normal');
    });
  });

  describe('self-aoe (range=Self + area_of_effect)', () => {
    it('Burning Hands: cone 15ft a partir do caster', () => {
      const result = getSpellEffectiveRange(
        makeSpell({
          slug: 'burning-hands',
          range: 'Self',
          area_of_effect: { type: 'cone', size: 15 },
        }),
      );
      expect(result.kind).toBe('self-aoe');
      expect(result.aoeShape).toEqual({ type: 'cone', size: 15 });
      expect(result.attackRangeFt).toBeNull();
    });

    it('Thunderwave: cube 15ft', () => {
      const result = getSpellEffectiveRange(
        makeSpell({
          slug: 'thunderwave',
          range: 'Self',
          area_of_effect: { type: 'cube', size: 15 },
        }),
      );
      expect(result.kind).toBe('self-aoe');
    });

    it('shape sem type/size (xphb tags) não é AoE real', () => {
      const result = getSpellEffectiveRange(
        makeSpell({
          slug: 'fire-bolt',
          range: '120 feet',
          attack_type: 'ranged',
          area_of_effect: { type: undefined, size: undefined },
        }),
      );
      expect(result.kind).toBe('normal');
    });
  });

  describe('self-origin-attack (range=Self + attack_type + sem AoE)', () => {
    it('Produce Flame: ranged 30ft, rejeita self como alvo', () => {
      const result = getSpellEffectiveRange(
        makeSpell({
          slug: 'produce-flame',
          range: 'Self',
          attack_type: 'ranged',
        }),
      );
      if (result.kind !== 'self-origin-attack') {
        throw new Error(`expected self-origin-attack, got ${result.kind}`);
      }
      expect(result.attackRangeFt).toBe(30);
      expect(result.attackType).toBe('ranged');
      expect(result.rejectSelfAsTarget).toBe(true);
    });

    it('Flame Blade: melee 5ft, rejeita self', () => {
      const result = getSpellEffectiveRange(
        makeSpell({
          slug: 'flame-blade',
          range: 'Self',
          attack_type: 'melee',
        }),
      );
      if (result.kind !== 'self-origin-attack') {
        throw new Error(`expected self-origin-attack, got ${result.kind}`);
      }
      expect(result.attackRangeFt).toBe(5);
      expect(result.attackType).toBe('melee');
      expect(result.rejectSelfAsTarget).toBe(true);
    });

    it('heurística: ranged sem override → 30ft default', () => {
      const result = getSpellEffectiveRange(
        makeSpell({
          slug: 'unknown-ranged-cantrip',
          range: 'Self',
          attack_type: 'ranged',
        }),
      );
      expect(result.kind).toBe('self-origin-attack');
      expect(result.attackRangeFt).toBe(30);
    });

    it('heurística: melee sem override → 5ft default', () => {
      const result = getSpellEffectiveRange(
        makeSpell({
          slug: 'unknown-melee',
          range: 'Self',
          attack_type: 'melee',
        }),
      );
      expect(result.attackRangeFt).toBe(5);
    });
  });

  describe('normal (range numérico ou Touch)', () => {
    it('Fireball: 150ft', () => {
      const result = getSpellEffectiveRange(
        makeSpell({ slug: 'fireball', range: '150 feet' }),
      );
      expect(result.kind).toBe('normal');
      expect(result.attackRangeFt).toBe(150);
    });

    it('Fire Bolt: ranged attack 120ft', () => {
      const result = getSpellEffectiveRange(
        makeSpell({
          slug: 'fire-bolt',
          range: '120 feet',
          attack_type: 'ranged',
        }),
      );
      expect(result.kind).toBe('normal');
      expect(result.attackRangeFt).toBe(120);
    });

    it('Cure Wounds (Touch): 5ft', () => {
      const result = getSpellEffectiveRange(
        makeSpell({ slug: 'cure-wounds', range: 'Touch' }),
      );
      expect(result.kind).toBe('normal');
      expect(result.attackRangeFt).toBe(5);
    });

    it('range inválido retorna normal com 0', () => {
      const result = getSpellEffectiveRange(
        makeSpell({ slug: 'broken', range: '???' }),
      );
      expect(result.kind).toBe('normal');
      expect(result.attackRangeFt).toBe(0);
    });
  });

  describe('rejectSelfAsTarget flag', () => {
    it('self-origin-attack sempre rejeita', () => {
      const produceFlame: SpellEffectiveRange = getSpellEffectiveRange(
        makeSpell({
          slug: 'produce-flame',
          range: 'Self',
          attack_type: 'ranged',
        }),
      );
      expect(produceFlame.rejectSelfAsTarget).toBe(true);
    });

    it('self-buff não rejeita (caster é o alvo legítimo)', () => {
      const mageArmor = getSpellEffectiveRange(
        makeSpell({ slug: 'mage-armor', range: 'Self' }),
      );
      expect(
        'rejectSelfAsTarget' in mageArmor ? mageArmor.rejectSelfAsTarget : false,
      ).toBe(false);
    });
  });
});
