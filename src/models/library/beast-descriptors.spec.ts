import type { MonsterEntity } from 'src/entities/monster.entity';
import {
  buildNarrativeDescriptor,
  buildTacticalSummary,
  extractAc,
  extractSpeed,
  formatCr,
  parseSpeedValue,
  passesLocomotionFilter,
  resolveMaxCr,
  toBeastSummary,
  truncateSoft,
} from './beast-descriptors';

function mockBeast(overrides: Partial<MonsterEntity> = {}): MonsterEntity {
  return {
    slug: 'brown-bear',
    name: 'Brown Bear',
    size: 'Large',
    type: 'beast',
    armor_class: [{ type: 'natural', value: 11 }],
    hit_points: 34,
    speed: { walk: '40 ft.', climb: '30 ft.' },
    strength: 19,
    dexterity: 10,
    constitution: 16,
    intelligence: 2,
    wisdom: 13,
    charisma: 7,
    challenge_rating: 1,
    actions: [
      { name: 'Multiattack', desc: '...' },
      { name: 'Bite', desc: '...' },
      { name: 'Claws', desc: '...' },
    ] as unknown as Record<string, unknown>,
    ...overrides,
  } as unknown as MonsterEntity;
}

describe('beast-descriptors — pure helpers', () => {
  describe('parseSpeedValue', () => {
    it('extracts integer from "40 ft." string', () => {
      expect(parseSpeedValue('40 ft.')).toBe(40);
    });
    it('passes through numeric values', () => {
      expect(parseSpeedValue(30)).toBe(30);
    });
    it('returns undefined for missing', () => {
      expect(parseSpeedValue(undefined)).toBeUndefined();
      expect(parseSpeedValue(null)).toBeUndefined();
      expect(parseSpeedValue('ft.')).toBeUndefined();
    });
  });

  describe('extractAc', () => {
    it('reads SRD array shape [{type,value}]', () => {
      expect(extractAc([{ type: 'natural', value: 13 }])).toBe(13);
    });
    it('reads object shape {value}', () => {
      expect(extractAc({ value: 12 })).toBe(12);
    });
    it('reads scalar number', () => {
      expect(extractAc(14)).toBe(14);
    });
    it('defaults to 10 on malformed', () => {
      expect(extractAc(null)).toBe(10);
      expect(extractAc('oops')).toBe(10);
      expect(extractAc([])).toBe(10);
    });
  });

  describe('extractSpeed', () => {
    it('keeps only movement modes that exist', () => {
      const speed = extractSpeed({ walk: '40 ft.', fly: '60 ft.' });
      expect(speed).toEqual({ walk: 40, fly: 60 });
      expect(speed.swim).toBeUndefined();
    });
    it('returns empty object for null/empty', () => {
      expect(extractSpeed(null)).toEqual({});
      expect(extractSpeed(undefined)).toEqual({});
      expect(extractSpeed({})).toEqual({});
    });
  });

  describe('formatCr', () => {
    it('formats fractional CRs as fractions', () => {
      expect(formatCr(0.125)).toBe('1/8');
      expect(formatCr(0.25)).toBe('1/4');
      expect(formatCr(0.5)).toBe('1/2');
    });
    it('formats integer CRs', () => {
      expect(formatCr(1)).toBe('1');
      expect(formatCr(5)).toBe('5');
    });
  });

  describe('truncateSoft', () => {
    it('returns original when under max', () => {
      expect(truncateSoft('short', 10)).toBe('short');
    });
    it('truncates at word boundary when possible', () => {
      const r = truncateSoft('lorem ipsum dolor sit amet consectetur', 20);
      expect(r.length).toBeLessThanOrEqual(20);
      expect(r.endsWith('…')).toBe(true);
    });
    it('strips trailing punctuation before ellipsis', () => {
      const r = truncateSoft('palavra longa, que continua, muito mais', 15);
      expect(r).not.toMatch(/,…$/);
    });
  });

  describe('buildTacticalSummary', () => {
    it('includes CR, HP, AC, speed, attacks under 140 chars', () => {
      const t = buildTacticalSummary(mockBeast());
      expect(t).toContain('CR 1');
      expect(t).toContain('34 HP');
      expect(t).toContain('AC 11');
      expect(t).toContain('walk 40');
      expect(t).toContain('climb 30');
      expect(t).toMatch(/multiattack.*bite.*claws|multiattack.*claws.*bite/);
      expect(t.length).toBeLessThanOrEqual(140);
    });
    it('handles beasts without multiattack', () => {
      const t = buildTacticalSummary(mockBeast({
        actions: [{ name: 'Bite' }] as unknown as Record<string, unknown>,
      }));
      expect(t.toLowerCase()).toContain('bite');
      expect(t.toLowerCase()).not.toContain('multiattack');
    });
    it('handles beasts with no actions at all', () => {
      const t = buildTacticalSummary(mockBeast({
        actions: undefined,
      }));
      expect(t).toContain('sem multiattack');
    });
    it('uses fractional CR format', () => {
      const t = buildTacticalSummary(mockBeast({
        challenge_rating: 0.25,
      }));
      expect(t).toContain('CR 1/4');
    });
  });

  describe('buildNarrativeDescriptor', () => {
    it('uses name-flavor match for known families', () => {
      expect(buildNarrativeDescriptor(mockBeast())).toMatch(/pelagem|garras/);
      expect(buildNarrativeDescriptor(mockBeast({ slug: 'wolf', name: 'Wolf', size: 'Medium' })))
        .toMatch(/ágil|presas/);
      expect(buildNarrativeDescriptor(mockBeast({ slug: 'giant-eagle', name: 'Giant Eagle', size: 'Large' })))
        .toMatch(/rapina|voo/);
    });
    it('falls back to generic flavor when name is unknown', () => {
      const r = buildNarrativeDescriptor(mockBeast({
        slug: 'exotic-foo',
        name: 'Exotic Foo',
        size: 'Small',
      }));
      expect(r).toMatch(/fera|olhos atentos|músculos/);
    });
    it('respects 120-char max', () => {
      const r = buildNarrativeDescriptor(mockBeast({ name: 'Ancient Armored Dinosaur of the Burning Canyons' }));
      expect(r.length).toBeLessThanOrEqual(120);
    });
    it('localizes size adjective', () => {
      expect(buildNarrativeDescriptor(mockBeast({ size: 'Large' }))).toContain('grande');
      expect(buildNarrativeDescriptor(mockBeast({ size: 'Tiny' }))).toContain('minúsculo');
    });
  });

  describe('toBeastSummary', () => {
    it('produces complete summary', () => {
      const s = toBeastSummary(mockBeast());
      expect(s.slug).toBe('brown-bear');
      expect(s.name).toBe('Brown Bear');
      expect(s.cr).toBe(1);
      expect(s.size).toBe('large');
      expect(s.hitPoints).toBe(34);
      expect(s.armorClass).toBe(11);
      expect(s.speed.walk).toBe(40);
      expect(s.speed.climb).toBe(30);
      expect(s.abilities.str).toBe(19);
      expect(s.tacticalSummary).toBeTruthy();
      expect(s.narrativeDescriptor).toBeTruthy();
    });
  });

  describe('passesLocomotionFilter', () => {
    const flyingBeast = mockBeast({
      slug: 'giant-eagle', name: 'Giant Eagle',
      speed: { walk: '10 ft.', fly: '80 ft.' },
    });
    const swimmingBeast = mockBeast({
      slug: 'shark', name: 'Reef Shark',
      speed: { swim: '40 ft.' },
    });
    const burrowingBeast = mockBeast({
      slug: 'giant-badger', name: 'Giant Badger',
      speed: { walk: '30 ft.', burrow: '10 ft.' },
    });

    it('allows all when no exclusion', () => {
      expect(passesLocomotionFilter(flyingBeast, {})).toBe(true);
      expect(passesLocomotionFilter(swimmingBeast, {})).toBe(true);
      expect(passesLocomotionFilter(burrowingBeast, {})).toBe(true);
    });
    it('excludes fliers when excludeFly', () => {
      expect(passesLocomotionFilter(flyingBeast, { excludeFly: true })).toBe(false);
      expect(passesLocomotionFilter(mockBeast(), { excludeFly: true })).toBe(true);
    });
    it('excludes swimmers when excludeSwim', () => {
      expect(passesLocomotionFilter(swimmingBeast, { excludeSwim: true })).toBe(false);
    });
    it('excludes burrowers when excludeBurrow', () => {
      expect(passesLocomotionFilter(burrowingBeast, { excludeBurrow: true })).toBe(false);
    });
  });

  describe('resolveMaxCr', () => {
    it('computes fraction when denominator provided', () => {
      expect(resolveMaxCr(1, 4)).toBe(0.25);
      expect(resolveMaxCr(1, 2)).toBe(0.5);
      expect(resolveMaxCr(1, 8)).toBe(0.125);
    });
    it('default denominator=1 yields integer CR', () => {
      expect(resolveMaxCr(1, 1)).toBe(1);
      expect(resolveMaxCr(6, 1)).toBe(6);
    });
    it('rejects invalid denominators', () => {
      expect(() => resolveMaxCr(1, 3)).toThrow('INVALID_CR_DENOMINATOR');
      expect(() => resolveMaxCr(1, 0)).toThrow('INVALID_CR_DENOMINATOR');
    });
    it('rejects negative/non-integer numerator', () => {
      expect(() => resolveMaxCr(-1, 1)).toThrow('INVALID_CR_FILTER');
      expect(() => resolveMaxCr(1.5, 1)).toThrow('INVALID_CR_FILTER');
    });
  });
});
