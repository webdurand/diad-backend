

import { PROF_TO_CATEGORIES } from "./srd-constants";

const SIMPLE_MELEE_WEAPONS = new Set([
  "club",
  "dagger",
  "greatclub",
  "handaxe",
  "javelin",
  "light-hammer",
  "mace",
  "quarterstaff",
  "sickle",
  "spear",
]);

const SIMPLE_RANGED_WEAPONS = new Set([
  "dart",
  "light-crossbow",
  "shortbow",
  "sling",
]);

const MARTIAL_MELEE_WEAPONS = new Set([
  "battleaxe",
  "flail",
  "glaive",
  "greataxe",
  "greatsword",
  "halberd",
  "lance",
  "longsword",
  "maul",
  "morningstar",
  "pike",
  "rapier",
  "scimitar",
  "shortsword",
  "trident",
  "war-pick",
  "warhammer",
  "whip",
]);

const MARTIAL_RANGED_WEAPONS = new Set([
  "blowgun",
  "hand-crossbow",
  "heavy-crossbow",
  "longbow",
  "net",
]);

function canonicalEquipmentSlug(slug: string): string {
  return slug.toLowerCase().replace(/-(?:phb|xphb|srd52)$/i, "");
}

export function inferWeaponCategory(equipSlug: string): string | null {
  const slug = canonicalEquipmentSlug(equipSlug);
  if (SIMPLE_MELEE_WEAPONS.has(slug)) return "simple-melee-weapons";
  if (SIMPLE_RANGED_WEAPONS.has(slug)) return "simple-ranged-weapons";
  if (MARTIAL_MELEE_WEAPONS.has(slug)) return "martial-melee-weapons";
  if (MARTIAL_RANGED_WEAPONS.has(slug)) return "martial-ranged-weapons";
  return null;
}

export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}


export function isEquipmentProficient(
  equipSlug: string,
  categorySlugs: Set<string>,
  profSlugs: Set<string>,
): boolean | null {
  const effectiveCategories = new Set(categorySlugs);
  const inferredWeaponCategory = inferWeaponCategory(equipSlug);
  if (inferredWeaponCategory) {
    effectiveCategories.add(inferredWeaponCategory);
  }
  const isArmor =
    effectiveCategories.has("light-armor") ||
    effectiveCategories.has("medium-armor") ||
    effectiveCategories.has("heavy-armor") ||
    effectiveCategories.has("shields") ||
    effectiveCategories.has("shield");

  const isWeapon =
    effectiveCategories.has("simple-melee-weapons") ||
    effectiveCategories.has("simple-ranged-weapons") ||
    effectiveCategories.has("martial-melee-weapons") ||
    effectiveCategories.has("martial-ranged-weapons");

  if (!isArmor && !isWeapon) return null;


  const canonicalSlug = canonicalEquipmentSlug(equipSlug);
  if (profSlugs.has(equipSlug) || profSlugs.has(canonicalSlug)) return true;

  if (profSlugs.has(equipSlug + "s") || profSlugs.has(canonicalSlug + "s")) {
    return true;
  }


  for (const [profSlug, cats] of Object.entries(PROF_TO_CATEGORIES)) {
    if (
      profSlugs.has(profSlug) &&
      cats.some((c) => effectiveCategories.has(c))
    ) {
      return true;
    }
  }

  return false;
}


export const DRACONIC_ANCESTRY_MAP: Record<
  string,
  { damageType: string; shape: string }
> = {
  black: { damageType: "acid", shape: "5 by 30 ft. line" },
  blue: { damageType: "lightning", shape: "5 by 30 ft. line" },
  brass: { damageType: "fire", shape: "5 by 30 ft. line" },
  bronze: { damageType: "lightning", shape: "5 by 30 ft. line" },
  copper: { damageType: "acid", shape: "5 by 30 ft. line" },
  gold: { damageType: "fire", shape: "15 ft. cone" },
  green: { damageType: "poison", shape: "15 ft. cone" },
  red: { damageType: "fire", shape: "15 ft. cone" },
  silver: { damageType: "cold", shape: "15 ft. cone" },
  white: { damageType: "cold", shape: "15 ft. cone" },
};
