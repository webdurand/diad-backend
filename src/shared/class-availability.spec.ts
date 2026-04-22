import { isClassAvailable, getCanonicalSubclassSlugs } from './class-availability';

describe('class-availability (spec 012 canonical-first)', () => {
  describe('isClassAvailable', () => {
    it('retorna true pras 6 classes validadas em tela', () => {
      expect(isClassAvailable('fighter')).toBe(true);
      expect(isClassAvailable('barbarian')).toBe(true);
      expect(isClassAvailable('cleric')).toBe(true);
      expect(isClassAvailable('paladin')).toBe(true);
      expect(isClassAvailable('wizard')).toBe(true);
      expect(isClassAvailable('sorcerer')).toBe(true);
    });

    it('retorna false pras 6 classes pendentes', () => {
      expect(isClassAvailable('druid')).toBe(false);
      expect(isClassAvailable('bard')).toBe(false);
      expect(isClassAvailable('warlock')).toBe(false);
      expect(isClassAvailable('monk')).toBe(false);
      expect(isClassAvailable('rogue')).toBe(false);
      expect(isClassAvailable('ranger')).toBe(false);
    });

    it('canonicaliza slugs 2014 (-phb) pras mesmas regras', () => {
      expect(isClassAvailable('fighter-phb')).toBe(true);
      expect(isClassAvailable('druid-phb')).toBe(false);
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
    });

    it('retorna lista vazia pras classes pendentes', () => {
      expect(getCanonicalSubclassSlugs('druid')).toEqual([]);
      expect(getCanonicalSubclassSlugs('bard')).toEqual([]);
    });

    it('canonicaliza -phb', () => {
      expect(getCanonicalSubclassSlugs('fighter-phb')).toEqual(['champion']);
    });
  });
});
