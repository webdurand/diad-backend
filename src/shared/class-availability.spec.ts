import { isClassAvailable, getCanonicalSubclassSlugs } from './class-availability';

describe('class-availability (spec 012 canonical-first)', () => {
  describe('isClassAvailable', () => {
    it('retorna true pras 9 classes validadas em tela', () => {
      expect(isClassAvailable('fighter')).toBe(true);
      expect(isClassAvailable('barbarian')).toBe(true);
      expect(isClassAvailable('cleric')).toBe(true);
      expect(isClassAvailable('paladin')).toBe(true);
      expect(isClassAvailable('wizard')).toBe(true);
      expect(isClassAvailable('sorcerer')).toBe(true);
      expect(isClassAvailable('druid')).toBe(true);
      expect(isClassAvailable('bard')).toBe(true);
      expect(isClassAvailable('warlock')).toBe(true);
    });

    it('retorna false pras 3 classes pendentes', () => {
      expect(isClassAvailable('monk')).toBe(false);
      expect(isClassAvailable('rogue')).toBe(false);
      expect(isClassAvailable('ranger')).toBe(false);
    });

    it('canonicaliza slugs 2014 (-phb) pras mesmas regras', () => {
      expect(isClassAvailable('fighter-phb')).toBe(true);
      expect(isClassAvailable('druid-phb')).toBe(true);
      expect(isClassAvailable('bard-phb')).toBe(true);
      expect(isClassAvailable('warlock-phb')).toBe(true);
      expect(isClassAvailable('monk-phb')).toBe(false);
    });

    it('retorna false pra slug desconhecida', () => {
      expect(isClassAvailable('blood-hunter')).toBe(false);
    });
  });

  describe('getCanonicalSubclassSlugs', () => {
    it('retorna s\u00f3 a subclasse can\u00f4nica pra cada classe liberada', () => {
      expect(getCanonicalSubclassSlugs('fighter')).toEqual(['champion']);
      expect(getCanonicalSubclassSlugs('barbarian')).toEqual(['berserker']);
      expect(getCanonicalSubclassSlugs('cleric')).toEqual(['life']);
      expect(getCanonicalSubclassSlugs('paladin')).toEqual(['devotion']);
      expect(getCanonicalSubclassSlugs('wizard')).toEqual(['evocation']);
      expect(getCanonicalSubclassSlugs('sorcerer')).toEqual(['draconic']);
      // Druid tem 2 slugs can\u00f4nicos (duplica\u00e7\u00e3o DB 'druid-land' vs 'land')
      expect(getCanonicalSubclassSlugs('druid')).toEqual(['druid-land', 'land']);
      expect(getCanonicalSubclassSlugs('bard')).toEqual(['bard-lore', 'lore']);
      expect(getCanonicalSubclassSlugs('warlock')).toEqual(['warlock-fiend', 'fiend']);
    });

    it('retorna lista vazia pras classes pendentes', () => {
      expect(getCanonicalSubclassSlugs('monk')).toEqual([]);
      expect(getCanonicalSubclassSlugs('rogue')).toEqual([]);
    });

    it('canonicaliza -phb', () => {
      expect(getCanonicalSubclassSlugs('fighter-phb')).toEqual(['champion']);
    });
  });
});
