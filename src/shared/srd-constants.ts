// Consolidated SRD 5.2.1 constants — single source of truth for all services

/**
 * Normalizes a class slug by removing variant suffixes (-phb, etc.)
 * so constants work with both 'druid' and 'druid-phb' style slugs.
 */
export function normalizeClassSlug(slug: string): string {
  return slug.replace(/-phb$/, '');
}

// Proficiency bonus by total character level (1-20)
export const PROF_BONUS_BY_LEVEL: Record<number, number> = {
  1: 2, 2: 2, 3: 2, 4: 2,
  5: 3, 6: 3, 7: 3, 8: 3,
  9: 4, 10: 4, 11: 4, 12: 4,
  13: 5, 14: 5, 15: 5, 16: 5,
  17: 6, 18: 6, 19: 6, 20: 6,
};

// SRD Character Advancement XP thresholds
// Index 0 = Level 1 (0 XP needed), Index 1 = Level 2 (300 XP needed), ... Index 19 = Level 20
export const XP_THRESHOLDS: number[] = [
  0,      // Level 1
  300,    // Level 2
  900,    // Level 3
  2700,   // Level 4
  6500,   // Level 5
  14000,  // Level 6
  23000,  // Level 7
  34000,  // Level 8
  48000,  // Level 9
  64000,  // Level 10
  85000,  // Level 11
  100000, // Level 12
  120000, // Level 13
  140000, // Level 14
  165000, // Level 15
  195000, // Level 16
  225000, // Level 17
  265000, // Level 18
  305000, // Level 19
  355000, // Level 20
];

// Spellcasting ability per class slug
export const SPELLCASTING_ABILITY: Record<string, string> = {
  bard: 'cha',
  cleric: 'wis',
  druid: 'wis',
  paladin: 'cha',
  ranger: 'wis',
  sorcerer: 'cha',
  warlock: 'cha',
  wizard: 'int',
};

// Caster type classification for spell management
export type CasterClassType = 'total_access' | 'known' | 'spellbook' | 'pact';

export const CASTER_CLASS_TYPE: Record<string, CasterClassType> = {
  cleric: 'total_access',
  druid: 'total_access',
  paladin: 'total_access',
  bard: 'known',
  sorcerer: 'known',
  ranger: 'known',
  warlock: 'pact',
  wizard: 'spellbook',
};

// Caster slot type for multiclass slot calculation
export const CASTER_SLOT_TYPE: Record<string, 'full' | 'half' | 'pact'> = {
  bard: 'full',
  cleric: 'full',
  druid: 'full',
  sorcerer: 'full',
  wizard: 'full',
  paladin: 'half',
  ranger: 'half',
  warlock: 'pact',
};

// Normalized lookup helpers — work with both 'druid' and 'druid-phb' slugs
export function getSpellcastingAbility(slug: string): string | undefined {
  return SPELLCASTING_ABILITY[normalizeClassSlug(slug)];
}

export function getCasterClassType(slug: string): CasterClassType | undefined {
  return CASTER_CLASS_TYPE[normalizeClassSlug(slug)];
}

export function getCasterSlotType(slug: string): 'full' | 'half' | 'pact' | undefined {
  return CASTER_SLOT_TYPE[normalizeClassSlug(slug)];
}

// Full-caster spell slots table (SRD)
// Index = effective caster level (1-based), value = [1st, 2nd, ...]
export const FULL_CASTER_SLOTS: number[][] = [
  [],
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

// Warlock Pact Magic slots (index = warlock level - 1)
export const WARLOCK_SLOTS: Array<{ slots: number; level: number }> = [
  { slots: 1, level: 1 },
  { slots: 2, level: 1 },
  { slots: 2, level: 2 },
  { slots: 2, level: 2 },
  { slots: 2, level: 3 },
  { slots: 2, level: 3 },
  { slots: 2, level: 4 },
  { slots: 2, level: 4 },
  { slots: 2, level: 5 },
  { slots: 2, level: 5 },
  { slots: 3, level: 5 },
  { slots: 3, level: 5 },
  { slots: 3, level: 5 },
  { slots: 3, level: 5 },
  { slots: 3, level: 5 },
  { slots: 3, level: 5 },
  { slots: 4, level: 5 },
  { slots: 4, level: 5 },
  { slots: 4, level: 5 },
  { slots: 4, level: 5 },
];

// Map proficiency slugs to equipment category slugs
export const PROF_TO_CATEGORIES: Record<string, string[]> = {
  'light-armor': ['light-armor'],
  'medium-armor': ['medium-armor'],
  'heavy-armor': ['heavy-armor'],
  shields: ['shields', 'shield'],
  'simple-weapons': ['simple-melee-weapons', 'simple-ranged-weapons'],
  'martial-weapons': ['martial-melee-weapons', 'martial-ranged-weapons'],
};
