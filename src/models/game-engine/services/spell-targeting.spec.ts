import {
  getAoeShape,
  cellInAoe,
  getPerHitDamage,
  isAoeSpell,
  isMultiTargetNonAoeSpell,
  maxTargetsFor,
} from './spell-targeting';

describe('spell-targeting', () => {
  describe('getAoeShape', () => {
    it('returns sphere shape with radius in cells for Fireball', () => {
      const shape = getAoeShape({
        area_of_effect: { type: 'sphere', size: 20 },
      } as any);
      expect(shape).toEqual({ kind: 'sphere', radiusCells: 4, sizeFt: 20 });
    });

    it('returns cone shape for Burning Hands 15ft', () => {
      const shape = getAoeShape({
        area_of_effect: { type: 'cone', size: 15 },
      } as any);
      expect(shape).toEqual({ kind: 'cone', radiusCells: 3, sizeFt: 15 });
    });

    it('returns cube shape for Thunderwave 15ft', () => {
      const shape = getAoeShape({
        area_of_effect: { type: 'cube', size: 15 },
      } as any);
      expect(shape).toEqual({ kind: 'cube', radiusCells: 3, sizeFt: 15 });
    });

    it('rejects XPHB 2024 metadata-only area_of_effect (tags apenas)', () => {
      const shape = getAoeShape({
        area_of_effect: { tags: ['multiple targets'] },
      } as any);
      expect(shape).toBeNull();
    });

    it('returns null when area_of_effect is null', () => {
      expect(getAoeShape({ area_of_effect: null } as any)).toBeNull();
    });
  });

  describe('cellInAoe', () => {
    it('includes cells within sphere radius', () => {
      const shape = { kind: 'sphere' as const, radiusCells: 4, sizeFt: 20 };
      expect(cellInAoe({ x: 2, y: 2 }, { x: 0, y: 0 }, shape)).toBe(true);
      expect(cellInAoe({ x: 4, y: 0 }, { x: 0, y: 0 }, shape)).toBe(true);
    });

    it('excludes cells outside sphere radius', () => {
      const shape = { kind: 'sphere' as const, radiusCells: 4, sizeFt: 20 };
      expect(cellInAoe({ x: 5, y: 0 }, { x: 0, y: 0 }, shape)).toBe(false);
      // sqrt(18) ≈ 4.24 > 4 radius → excluded
      expect(cellInAoe({ x: 3, y: 3 }, { x: 0, y: 0 }, shape)).toBe(false);
      // sqrt(8) ≈ 2.83 ≤ 4 radius → included
      expect(cellInAoe({ x: 2, y: 2 }, { x: 0, y: 0 }, shape)).toBe(true);
    });

    it('includes cells within cube radius on both axes', () => {
      const shape = { kind: 'cube' as const, radiusCells: 3, sizeFt: 15 };
      expect(cellInAoe({ x: 3, y: 3 }, { x: 0, y: 0 }, shape)).toBe(true);
      expect(cellInAoe({ x: 4, y: 0 }, { x: 0, y: 0 }, shape)).toBe(false);
    });
  });

  describe('getPerHitDamage', () => {
    it('returns 1d4+1 force for Magic Missile at any slot', () => {
      expect(getPerHitDamage('magic-missile', 1, 1)).toEqual({
        expression: '1d4+1',
        type: 'force',
      });
      expect(getPerHitDamage('magic-missile', 5, 10)).toEqual({
        expression: '1d4+1',
        type: 'force',
      });
    });

    it('returns 2d6 fire for Scorching Ray', () => {
      expect(getPerHitDamage('scorching-ray', 2, 5)).toEqual({
        expression: '2d6',
        type: 'fire',
      });
    });

    it('returns 1d10 force for Eldritch Blast per beam', () => {
      expect(getPerHitDamage('eldritch-blast', 0, 5)).toEqual({
        expression: '1d10',
        type: 'force',
      });
    });

    it('scales Acid Splash cantrip by caster level', () => {
      expect(getPerHitDamage('acid-splash', 0, 1)).toEqual({
        expression: '1d6',
        type: 'acid',
      });
      expect(getPerHitDamage('acid-splash', 0, 5)).toEqual({
        expression: '2d6',
        type: 'acid',
      });
      expect(getPerHitDamage('acid-splash', 0, 11)).toEqual({
        expression: '3d6',
        type: 'acid',
      });
      expect(getPerHitDamage('acid-splash', 0, 17)).toEqual({
        expression: '4d6',
        type: 'acid',
      });
    });

    it('handles xphb/phb suffixes', () => {
      expect(getPerHitDamage('magic-missile-xphb', 1, 1)).toEqual({
        expression: '1d4+1',
        type: 'force',
      });
    });

    it('returns null for non-multi-target spells', () => {
      expect(getPerHitDamage('fireball', 3, 5)).toBeNull();
      expect(getPerHitDamage('cure-wounds', 1, 1)).toBeNull();
    });
  });

  describe('isAoeSpell + maxTargetsFor', () => {
    it('Fireball is AoE with infinity maxTargets', () => {
      const spell = {
        slug: 'fireball',
        area_of_effect: { type: 'sphere', size: 20 },
      } as any;
      expect(isAoeSpell(spell)).toBe(true);
      expect(maxTargetsFor(spell, 3, 5)).toBe(Number.POSITIVE_INFINITY);
    });

    it('Magic Missile is multi-target non-AoE, darts scale with slot', () => {
      const spell = { slug: 'magic-missile', area_of_effect: null } as any;
      expect(isAoeSpell(spell)).toBe(false);
      expect(isMultiTargetNonAoeSpell(spell)).toBe(true);
      expect(maxTargetsFor(spell, 1, 1)).toBe(3);
      expect(maxTargetsFor(spell, 3, 5)).toBe(5);
    });
  });
});
