import { MonsterActionResolver } from '../services/monster-action-resolver.service';

describe('MonsterActionResolver', () => {
  let resolver: MonsterActionResolver;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    resolver = new MonsterActionResolver();
    warnSpy = jest.spyOn(resolver['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('uses structured attack_bonus when present', () => {
    const action = {
      name: 'Scimitar',
      desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.',
      attack_bonus: 4,
      damage: [{ damage_dice: '1d6+2', damage_type: { name: 'slashing' } }],
    };

    const resolved = resolver.resolve(action, 'Goblin');

    expect(resolved.attackBonus).toBe(4);
    expect(resolved.attackBonusSource).toBe('structured');
    expect(resolved.damageDice).toBe('1d6+2');
    expect(resolved.damageType).toBe('slashing');
    expect(resolved.hasAttack).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to "+X to hit" regex when structured bonus missing', () => {
    const action = {
      name: 'Bite',
      desc: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one target.',
    };

    const resolved = resolver.resolve(action, 'Owlbear');

    expect(resolved.attackBonus).toBe(7);
    expect(resolved.attackBonusSource).toBe('regex');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('handles negative bonuses in regex', () => {
    const action = {
      name: 'Weak Slap',
      desc: 'Melee Weapon Attack: -1 to hit, reach 5 ft.',
    };

    const resolved = resolver.resolve(action, 'Commoner');

    expect(resolved.attackBonus).toBe(-1);
    expect(resolved.attackBonusSource).toBe('regex');
  });

  it('returns 0 with warning when action looks like an attack but has no bonus info', () => {
    const action = {
      name: 'Broken Attack',
      desc: 'Melee Weapon Attack with an attack roll against the target.',
    };

    const resolved = resolver.resolve(action, 'BadData');

    expect(resolved.attackBonus).toBe(0);
    expect(resolved.attackBonusSource).toBe('fallback');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/BadData\/Broken Attack/);
  });

  it('does not warn for non-attack actions (saves/features)', () => {
    const action = {
      name: 'Fire Breath',
      desc: 'The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw.',
    };

    const resolved = resolver.resolve(action, 'AdultRedDragon');

    expect(resolved.attackBonus).toBe(0);
    expect(resolved.attackBonusSource).toBe('none');
    expect(resolved.hasAttack).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('derives damage from description when structured damage missing', () => {
    const action = {
      name: 'Club',
      desc: 'Melee Weapon Attack: +2 to hit. Hit: (1d4) bludgeoning damage.',
    };

    const resolved = resolver.resolve(action, 'Kobold');

    expect(resolved.damageDice).toBe('1d4');
    expect(resolved.damageType).toBe('bludgeoning');
  });

  it('resolveByName finds action case-insensitively', () => {
    const monster = {
      name: 'Owlbear',
      actions: [
        { name: 'Multiattack', desc: 'The owlbear makes two attacks.' },
        { name: 'Beak', desc: 'Melee Weapon Attack: +7 to hit.', attack_bonus: 7 },
      ],
    };

    const resolved = resolver.resolveByName(monster, 'beak');
    expect(resolved).not.toBeNull();
    expect(resolved!.attackBonus).toBe(7);
  });

  it('resolveByName returns null for unknown action', () => {
    const monster = {
      name: 'Owlbear',
      actions: [{ name: 'Beak', desc: '+7 to hit' }],
    };

    expect(resolver.resolveByName(monster, 'Fire Breath')).toBeNull();
  });
});
