import { FightingStyleService, AttackFightingStyleContext } from '../services/fighting-style.service';
import { DiceService } from '../services/dice.service';

// Spec 012 Fase 0 — testes unit FightingStyleService (7 styles Tier A).
// Deferred: blind-fighting (blindsight), interception/protection (reactions).

function baseCtx(over: Partial<AttackFightingStyleContext> = {}): AttackFightingStyleContext {
  return {
    fightingStyleSlug: null,
    isMelee: true,
    isTwoHanded: false,
    isThrown: false,
    isOneHandNoOffhand: true,
    isOffhandAttack: false,
    abilityMod: 3,
    isUnarmed: false,
    hasBothHandsFree: false,
    ...over,
  };
}

describe('FightingStyleService', () => {
  let dice: DiceService;
  let service: FightingStyleService;

  beforeEach(() => {
    dice = new DiceService();
    service = new FightingStyleService(dice);
  });

  describe('sem fighting style', () => {
    it('retorna zero em tudo', () => {
      const res = service.resolveAttackModifiers(baseCtx());
      expect(res.attackBonus).toBe(0);
      expect(res.damageBonus).toBe(0);
      expect(res.rerollLowDamage).toBe(false);
      expect(res.appliedStyle).toBeUndefined();
    });
  });

  describe('Archery', () => {
    it('+2 attack ranged (não thrown)', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'archery', isMelee: false, isThrown: false }),
      );
      expect(res.attackBonus).toBe(2);
      expect(res.appliedStyle).toBe('archery');
    });

    it('não aplica em melee', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'archery', isMelee: true }),
      );
      expect(res.attackBonus).toBe(0);
    });

    it('não aplica em thrown (tem thrown-weapon-fighting próprio)', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'archery', isMelee: false, isThrown: true }),
      );
      expect(res.attackBonus).toBe(0);
    });
  });

  describe('Dueling', () => {
    it('+2 damage em 1h melee sem two-handed', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'dueling', isMelee: true, isTwoHanded: false, isOneHandNoOffhand: true }),
      );
      expect(res.damageBonus).toBe(2);
      expect(res.appliedStyle).toBe('dueling');
    });

    it('não aplica em two-handed', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'dueling', isMelee: true, isTwoHanded: true }),
      );
      expect(res.damageBonus).toBe(0);
    });

    it('não aplica em ranged', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'dueling', isMelee: false }),
      );
      expect(res.damageBonus).toBe(0);
    });
  });

  describe('Great Weapon Fighting', () => {
    it('marca rerollLowDamage em 2h melee', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'great-weapon-fighting', isMelee: true, isTwoHanded: true }),
      );
      expect(res.rerollLowDamage).toBe(true);
      expect(res.appliedStyle).toBe('great-weapon-fighting');
    });

    it('não aplica em 1h', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'great-weapon-fighting', isTwoHanded: false }),
      );
      expect(res.rerollLowDamage).toBe(false);
    });
  });

  describe('Thrown Weapon Fighting', () => {
    it('+2 damage em thrown', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'thrown-weapon-fighting', isThrown: true }),
      );
      expect(res.damageBonus).toBe(2);
      expect(res.appliedStyle).toBe('thrown-weapon-fighting');
    });

    it('não aplica em não-thrown', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'thrown-weapon-fighting', isThrown: false }),
      );
      expect(res.damageBonus).toBe(0);
    });
  });

  describe('Two-Weapon Fighting', () => {
    it('adiciona ability mod no offhand damage', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'two-weapon-fighting', isOffhandAttack: true, abilityMod: 4 }),
      );
      expect(res.damageBonus).toBe(4);
      expect(res.appliedStyle).toBe('two-weapon-fighting');
    });

    it('não aplica no main hand', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'two-weapon-fighting', isOffhandAttack: false }),
      );
      expect(res.damageBonus).toBe(0);
    });

    it('não aplica se abilityMod ≤ 0', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'two-weapon-fighting', isOffhandAttack: true, abilityMod: 0 }),
      );
      expect(res.damageBonus).toBe(0);
    });
  });

  describe('Unarmed Fighting', () => {
    it('unarmedDamageOverride d6 com uma mão ocupada', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'unarmed-fighting', isUnarmed: true, hasBothHandsFree: false }),
      );
      expect(res.unarmedDamageOverride).toEqual({ dice: '1d6' });
      expect(res.appliedStyle).toBe('unarmed-fighting');
    });

    it('unarmedDamageOverride d8 com 2 mãos livres', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'unarmed-fighting', isUnarmed: true, hasBothHandsFree: true }),
      );
      expect(res.unarmedDamageOverride).toEqual({ dice: '1d8' });
    });

    it('não aplica em ataque com arma', () => {
      const res = service.resolveAttackModifiers(
        baseCtx({ fightingStyleSlug: 'unarmed-fighting', isUnarmed: false }),
      );
      expect(res.unarmedDamageOverride).toBeUndefined();
    });
  });

  describe('Defense (AC bonus)', () => {
    it('+1 AC com armadura', () => {
      expect(service.resolveAcBonus({ fightingStyleSlug: 'defense', hasArmor: true })).toBe(1);
    });

    it('sem bonus sem armadura', () => {
      expect(service.resolveAcBonus({ fightingStyleSlug: 'defense', hasArmor: false })).toBe(0);
    });

    it('sem bonus com outro style', () => {
      expect(service.resolveAcBonus({ fightingStyleSlug: 'archery', hasArmor: true })).toBe(0);
    });
  });

  describe('Tier B deferred', () => {
    it('blind-fighting / interception / protection — sem attack modifier', () => {
      for (const slug of ['blind-fighting', 'interception', 'protection']) {
        const res = service.resolveAttackModifiers(baseCtx({ fightingStyleSlug: slug }));
        expect(res.attackBonus).toBe(0);
        expect(res.damageBonus).toBe(0);
        expect(res.rerollLowDamage).toBe(false);
      }
    });
  });

  describe('applyRerollLowDamage (GWF mechanic)', () => {
    it('rerola 1s e 2s, aceita segundo roll', () => {
      dice.setSeed(42);
      const res = service.applyRerollLowDamage([1, 2, 5, 6], 6);
      expect(res.rerolled).toBe(true);
      // O segundo roll pode vir 1/2 de novo (RAW aceita), mas os 5/6 ficam intactos
      expect(res.rolls.length).toBe(4);
      expect(res.rolls[2]).toBe(5);
      expect(res.rolls[3]).toBe(6);
    });

    it('não rerola se todos > 2', () => {
      const res = service.applyRerollLowDamage([3, 4, 5], 6);
      expect(res.rerolled).toBe(false);
      expect(res.rolls).toEqual([3, 4, 5]);
    });

    it('total soma rolls finais', () => {
      dice.setSeed(1);
      const res = service.applyRerollLowDamage([2, 6], 6);
      expect(res.total).toBe(res.rolls.reduce((s, v) => s + v, 0));
    });
  });
});
