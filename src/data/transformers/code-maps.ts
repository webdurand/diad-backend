export const SPELL_SCHOOL_MAP: Record<string, string> = {
  A: 'abjuration',
  C: 'conjuration',
  D: 'divination',
  E: 'enchantment',
  V: 'evocation',
  I: 'illusion',
  N: 'necromancy',
  T: 'transmutation',
  P: 'psionic',
};

export const SIZE_MAP: Record<string, string> = {
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
};

export const ITEM_TYPE_MAP: Record<string, string> = {
  M: 'melee-weapon',
  R: 'ranged-weapon',
  LA: 'light-armor',
  MA: 'medium-armor',
  HA: 'heavy-armor',
  S: 'shield',
  A: 'ammunition',
  G: 'adventuring-gear',
  AT: 'artisans-tools',
  T: 'tool',
  INS: 'instrument',
  GS: 'gaming-set',
  SCF: 'spellcasting-focus',
  P: 'potion',
  SC: 'scroll',
  RD: 'rod',
  RG: 'ring',
  WD: 'wand',
  FD: 'food-and-drink',
  MNT: 'mount',
  TAH: 'tack-and-harness',
  TG: 'trade-good',
  $: 'treasure',
  $A: 'art-object',
  $C: 'coinage',
  $G: 'gemstone',
  VEH: 'vehicle-land',
  SHP: 'vehicle-water',
  AIR: 'vehicle-air',
  SPC: 'vehicle-space',
  EXP: 'explosive',
  AF: 'ammunition-futuristic',
  IDG: 'illegal-drug',
  OTH: 'other',
  GV: 'generic-variant',
  TB: 'trade-bar',
};

export const FEAT_CATEGORY_MAP: Record<string, string> = {
  G: 'general',
  O: 'origin',
  EB: 'epic_boon',
  FS: 'fighting_style',
  D: 'dragonmark',
};

export const DAMAGE_TYPE_MAP: Record<string, string> = {
  S: 'slashing',
  P: 'piercing',
  B: 'bludgeoning',
  A: 'acid',
  C: 'cold',
  F: 'fire',
  Fo: 'force',
  L: 'lightning',
  N: 'necrotic',
  Po: 'poison',
  Ps: 'psychic',
  R: 'radiant',
  T: 'thunder',
};

export const WEAPON_PROPERTY_MAP: Record<string, string> = {
  L: 'light',
  H: 'heavy',
  F: 'finesse',
  T: 'thrown',
  '2H': 'two-handed',
  V: 'versatile',
  A: 'ammunition',
  LD: 'loading',
  R: 'reach',
  S: 'special',
  RLD: 'reload',
};

export const ABILITY_MAP: Record<string, string> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
};

export const ATTACK_TYPE_MAP: Record<string, string> = {
  mw: 'Melee Weapon Attack',
  rw: 'Ranged Weapon Attack',
  ms: 'Melee Spell Attack',
  rs: 'Ranged Spell Attack',
  m: 'Melee Attack',
  r: 'Ranged Attack',
};

export const OPT_FEATURE_TYPE_MAP: Record<string, string> = {
  EI: 'eldritch_invocation',
  'MV:B': 'maneuver_battle_master',
  'MV:C2-UA': 'maneuver_ua',
  MM: 'metamagic',
  'FS:F': 'fighting_style_fighter',
  'FS:R': 'fighting_style_ranger',
  'FS:P': 'fighting_style_paladin',
  AS: 'arcane_shot',
  'AS:V1-UA': 'arcane_shot_ua',
  OG: 'onomancy_resonant',
  RN: 'rune_knight',
  AI: 'artificer_infusion',
  OR: 'onomancy_resonant',
  PB: 'pact_boon',
};

export const ALIGNMENT_MAP: Record<string, string> = {
  L: 'lawful',
  N: 'neutral',
  C: 'chaotic',
  G: 'good',
  E: 'evil',
  U: 'unaligned',
  A: 'any',
};
