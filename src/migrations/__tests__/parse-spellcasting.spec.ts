import {
  parseSpellcastingFromSpecialAbilities,
  slugifySpellName,
} from '../utils/parse-spellcasting';

describe('parseSpellcastingFromSpecialAbilities', () => {
  it('returns null when special_abilities is empty or missing', () => {
    expect(parseSpellcastingFromSpecialAbilities(null)).toBeNull();
    expect(parseSpellcastingFromSpecialAbilities([])).toBeNull();
    expect(parseSpellcastingFromSpecialAbilities([{ name: 'Amphibious' }])).toBeNull();
  });

  it('parses Archmage standard spellcasting block', () => {
    const abilities = [
      {
        name: 'Spellcasting',
        desc:
          `The archmage is an 18th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 18, +10 to hit with spell attacks). The archmage has the following wizard spells prepared:
Cantrips (at will): fire bolt, light, mage hand, prestidigitation
1st level (4 slots): detect magic, identify, mage armor, magic missile
2nd level (3 slots): detect thoughts, mirror image, misty step
3rd level (3 slots): counterspell, fireball, fly
4th level (3 slots): banishment, fire shield, stoneskin
5th level (3 slots): cone of cold, scrying, wall of force
6th level (1 slot): globe of invulnerability
7th level (1 slot): teleport
8th level (1 slot): mind blank
9th level (1 slot): time stop`,
      },
    ];

    const res = parseSpellcastingFromSpecialAbilities(abilities);

    expect(res).not.toBeNull();
    expect(res!.type).toBe('standard');
    expect(res!.ability).toBe('int');
    expect(res!.saveDc).toBe(18);
    expect(res!.attackBonus).toBe(10);
    expect(res!.casterLevel).toBe(18);
    expect(res!.slotsByLevel).toEqual({
      1: 4,
      2: 3,
      3: 3,
      4: 3,
      5: 3,
      6: 1,
      7: 1,
      8: 1,
      9: 1,
    });
    const slugs = res!.knownSpells.map((s) => s.slug);
    expect(slugs).toContain('fire-bolt');
    expect(slugs).toContain('magic-missile');
    expect(slugs).toContain('fireball');
    expect(slugs).toContain('time-stop');
    const cantrip = res!.knownSpells.find((s) => s.slug === 'fire-bolt');
    expect(cantrip?.level).toBe(0);
    const third = res!.knownSpells.find((s) => s.slug === 'fireball');
    expect(third?.level).toBe(3);
  });

  it('parses Dragon innate spellcasting block', () => {
    const abilities = [
      {
        name: 'Innate Spellcasting',
        desc:
          `The dragon's innate spellcasting ability is Charisma (spell save DC 21). It can innately cast the following spells, requiring no material components:
At will: detect magic, scrying
3/day each: fireball, lightning bolt
1/day each: dominate person`,
      },
    ];

    const res = parseSpellcastingFromSpecialAbilities(abilities);

    expect(res).not.toBeNull();
    expect(res!.type).toBe('innate');
    expect(res!.ability).toBe('cha');
    expect(res!.saveDc).toBe(21);
    expect(res!.attackBonus).toBe(13);
    expect(res!.dailyUses).toEqual({
      'detect-magic': 'at-will',
      scrying: 'at-will',
      fireball: '3/day',
      'lightning-bolt': '3/day',
      'dominate-person': '1/day',
    });
  });

  it('prefers innate block when both are present', () => {
    const abilities = [
      {
        name: 'Spellcasting',
        desc:
          `This creature is a 5th-level spellcaster. Its spellcasting ability is Wisdom (spell save DC 14, +6 to hit with spell attacks). It has the following spells prepared:
Cantrips (at will): guidance
1st level (3 slots): cure wounds`,
      },
      {
        name: 'Innate Spellcasting',
        desc:
          `The creature's innate spellcasting ability is Charisma (spell save DC 15). It can innately cast the following spells:
At will: minor illusion`,
      },
    ];

    const res = parseSpellcastingFromSpecialAbilities(abilities);
    expect(res!.type).toBe('innate');
    expect(res!.ability).toBe('cha');
  });

  it('returns null when block lacks DC or ability', () => {
    const abilities = [
      { name: 'Spellcasting', desc: 'The archmage casts some spells.' },
    ];
    expect(parseSpellcastingFromSpecialAbilities(abilities)).toBeNull();
  });

  it('defaults attackBonus to saveDc - 8 when "+X to hit" missing', () => {
    const abilities = [
      {
        name: 'Innate Spellcasting',
        desc:
          `The creature's innate spellcasting ability is Charisma (spell save DC 15). It can innately cast:
At will: minor illusion`,
      },
    ];
    const res = parseSpellcastingFromSpecialAbilities(abilities);
    expect(res!.attackBonus).toBe(7);
  });

  describe('slugifySpellName', () => {
    it('normalizes basic names', () => {
      expect(slugifySpellName('Fireball')).toBe('fireball');
      expect(slugifySpellName('Magic Missile')).toBe('magic-missile');
      expect(slugifySpellName("Tasha's Hideous Laughter")).toBe('tasha-s-hideous-laughter');
    });

    it('strips parentheticals', () => {
      expect(slugifySpellName('Meld into Stone (cast before combat)')).toBe('meld-into-stone');
    });
  });
});
