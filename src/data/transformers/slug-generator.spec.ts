import { generateSlug } from './slug-generator';

describe('generateSlug', () => {
  describe('XPHB source (no suffix)', () => {
    it('simple name', () => {
      expect(generateSlug('Aarakocra', 'XPHB')).toBe('aarakocra');
    });

    it('multi-word name', () => {
      expect(generateSlug('Chain Mail', 'XPHB')).toBe('chain-mail');
    });

    it('spell name', () => {
      expect(generateSlug('Fireball', 'XPHB')).toBe('fireball');
    });

    it('name with apostrophe', () => {
      expect(generateSlug("Melf's Acid Arrow", 'XPHB')).toBe('melfs-acid-arrow');
    });
  });

  describe('srd52 flag (no suffix)', () => {
    it('uses srd52 flag to skip suffix', () => {
      expect(generateSlug('Fireball', 'PHB', true)).toBe('fireball');
    });
  });

  describe('non-XPHB source (with suffix)', () => {
    it('adds source suffix', () => {
      expect(generateSlug('Aarakocra', 'MPMM')).toBe('aarakocra-mpmm');
    });

    it('PHB source gets suffix', () => {
      expect(generateSlug('Fireball', 'PHB')).toBe('fireball-phb');
    });

    it('DMG source gets suffix', () => {
      expect(generateSlug('+1 Longsword', 'DMG')).toBe('1-longsword-dmg');
    });
  });

  describe('special characters', () => {
    it('strips accents', () => {
      expect(generateSlug('Deja Vu', 'XPHB')).toBe('deja-vu');
      expect(generateSlug('Naive', 'XPHB')).toBe('naive');
    });

    it('strips parentheses', () => {
      expect(generateSlug('Longsword (Variant)', 'XPHB')).toBe('longsword-variant');
    });

    it('handles leading special chars', () => {
      expect(generateSlug('+1 Longsword', 'XPHB')).toBe('1-longsword');
    });

    it('collapses multiple hyphens', () => {
      expect(generateSlug('A -- B', 'XPHB')).toBe('a-b');
    });
  });

  describe('collision avoidance', () => {
    it('same name different sources produce different slugs', () => {
      const slug1 = generateSlug('Aarakocra', 'XPHB');
      const slug2 = generateSlug('Aarakocra', 'MPMM');
      expect(slug1).not.toBe(slug2);
    });

    it('XPHB and PHB produce different slugs for same name', () => {
      const slug1 = generateSlug('Fireball', 'XPHB');
      const slug2 = generateSlug('Fireball', 'PHB');
      expect(slug1).not.toBe(slug2);
    });
  });
});
