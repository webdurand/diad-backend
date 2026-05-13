


export function normalizeClassSlug(slug: string): string {
  return slug.replace(/-phb$/, "");
}


export const PROF_BONUS_BY_LEVEL: Record<number, number> = {
  1: 2,
  2: 2,
  3: 2,
  4: 2,
  5: 3,
  6: 3,
  7: 3,
  8: 3,
  9: 4,
  10: 4,
  11: 4,
  12: 4,
  13: 5,
  14: 5,
  15: 5,
  16: 5,
  17: 6,
  18: 6,
  19: 6,
  20: 6,
};



export const XP_THRESHOLDS: number[] = [
  0,
  300,
  900,
  2700,
  6500,
  14000,
  23000,
  34000,
  48000,
  64000,
  85000,
  100000,
  120000,
  140000,
  165000,
  195000,
  225000,
  265000,
  305000,
  355000,
];


export const SPELLCASTING_ABILITY: Record<string, string> = {
  bard: "cha",
  cleric: "wis",
  druid: "wis",
  paladin: "cha",
  ranger: "wis",
  sorcerer: "cha",
  warlock: "cha",
  wizard: "int",
};


export type CasterClassType = "total_access" | "known" | "spellbook" | "pact";

export const CASTER_CLASS_TYPE: Record<string, CasterClassType> = {
  cleric: "total_access",
  druid: "total_access",
  paladin: "total_access",
  bard: "known",
  sorcerer: "known",
  ranger: "known",
  warlock: "pact",
  wizard: "spellbook",
};


export const CASTER_SLOT_TYPE: Record<string, "full" | "half" | "pact"> = {
  bard: "full",
  cleric: "full",
  druid: "full",
  sorcerer: "full",
  wizard: "full",
  paladin: "half",
  ranger: "half",
  warlock: "pact",
};


export function getSpellcastingAbility(slug: string): string | undefined {
  return SPELLCASTING_ABILITY[normalizeClassSlug(slug)];
}

export function getCasterClassType(slug: string): CasterClassType | undefined {
  return CASTER_CLASS_TYPE[normalizeClassSlug(slug)];
}

export function getCasterSlotType(
  slug: string,
): "full" | "half" | "pact" | undefined {
  return CASTER_SLOT_TYPE[normalizeClassSlug(slug)];
}



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


export const PROF_TO_CATEGORIES: Record<string, string[]> = {
  "light-armor": ["light-armor"],
  "medium-armor": ["medium-armor"],
  "heavy-armor": ["heavy-armor"],
  shields: ["shields", "shield"],
  "simple-weapons": ["simple-melee-weapons", "simple-ranged-weapons"],
  "martial-weapons": ["martial-melee-weapons", "martial-ranged-weapons"],
};
