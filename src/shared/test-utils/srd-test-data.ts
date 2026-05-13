

export const HIT_DIE_BY_CLASS: Record<string, number> = {
  barbarian: 12,
  bard: 8,
  cleric: 8,
  druid: 8,
  fighter: 10,
  monk: 8,
  paladin: 10,
  ranger: 10,
  rogue: 8,
  sorcerer: 6,
  warlock: 8,
  wizard: 6,
};

export const SAVING_THROWS_BY_CLASS: Record<string, string[]> = {
  barbarian: ["str", "con"],
  bard: ["dex", "cha"],
  cleric: ["wis", "cha"],
  druid: ["int", "wis"],
  fighter: ["str", "con"],
  monk: ["str", "dex"],
  paladin: ["wis", "cha"],
  ranger: ["str", "dex"],
  rogue: ["dex", "int"],
  sorcerer: ["con", "cha"],
  warlock: ["wis", "cha"],
  wizard: ["int", "wis"],
};

export const SPELLCASTING_CLASSES = [
  "bard",
  "cleric",
  "druid",
  "paladin",
  "ranger",
  "sorcerer",
  "warlock",
  "wizard",
];

export const NON_SPELLCASTING_CLASSES = [
  "barbarian",
  "fighter",
  "monk",
  "rogue",
];

export const SRD_PROFICIENCY_BONUS: Array<{ level: number; bonus: number }> = [
  { level: 1, bonus: 2 },
  { level: 2, bonus: 2 },
  { level: 3, bonus: 2 },
  { level: 4, bonus: 2 },
  { level: 5, bonus: 3 },
  { level: 6, bonus: 3 },
  { level: 7, bonus: 3 },
  { level: 8, bonus: 3 },
  { level: 9, bonus: 4 },
  { level: 10, bonus: 4 },
  { level: 11, bonus: 4 },
  { level: 12, bonus: 4 },
  { level: 13, bonus: 5 },
  { level: 14, bonus: 5 },
  { level: 15, bonus: 5 },
  { level: 16, bonus: 5 },
  { level: 17, bonus: 6 },
  { level: 18, bonus: 6 },
  { level: 19, bonus: 6 },
  { level: 20, bonus: 6 },
];

export const SRD_XP_THRESHOLDS: Array<{ level: number; xp: number }> = [
  { level: 1, xp: 0 },
  { level: 2, xp: 300 },
  { level: 3, xp: 900 },
  { level: 4, xp: 2700 },
  { level: 5, xp: 6500 },
  { level: 6, xp: 14000 },
  { level: 7, xp: 23000 },
  { level: 8, xp: 34000 },
  { level: 9, xp: 48000 },
  { level: 10, xp: 64000 },
  { level: 11, xp: 85000 },
  { level: 12, xp: 100000 },
  { level: 13, xp: 120000 },
  { level: 14, xp: 140000 },
  { level: 15, xp: 165000 },
  { level: 16, xp: 195000 },
  { level: 17, xp: 225000 },
  { level: 18, xp: 265000 },
  { level: 19, xp: 305000 },
  { level: 20, xp: 355000 },
];


export const MONK_MARTIAL_ARTS_DIE: Array<{ level: number; die: string }> = [
  { level: 1, die: "1d6" },
  { level: 5, die: "1d8" },
  { level: 11, die: "1d10" },
  { level: 17, die: "1d12" },
];


export const CANTRIP_SCALING_LEVELS = [1, 5, 11, 17];
