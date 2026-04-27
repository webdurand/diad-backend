// Shared SRD utility functions — eliminates duplication across services

import { PROF_TO_CATEGORIES } from "./srd-constants";

/**
 * Calculates the ability score modifier.
 * Formula: floor((score - 10) / 2)
 */
export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Checks whether a character is proficient with a piece of equipment
 * based on equipment category slugs and the character's proficiency slugs.
 *
 * Returns `true` if proficient, `false` if not, or `null` if the item
 * is not a weapon or armor (proficiency doesn't apply).
 */
export function isEquipmentProficient(
  equipSlug: string,
  categorySlugs: Set<string>,
  profSlugs: Set<string>,
): boolean | null {
  const isArmor =
    categorySlugs.has("light-armor") ||
    categorySlugs.has("medium-armor") ||
    categorySlugs.has("heavy-armor") ||
    categorySlugs.has("shields") ||
    categorySlugs.has("shield");

  const isWeapon =
    categorySlugs.has("simple-melee-weapons") ||
    categorySlugs.has("simple-ranged-weapons") ||
    categorySlugs.has("martial-melee-weapons") ||
    categorySlugs.has("martial-ranged-weapons");

  if (!isArmor && !isWeapon) return null;

  // Check individual weapon/armor proficiency by equipment slug
  if (profSlugs.has(equipSlug)) return true;
  // Also try plural form (e.g. "longsword" equip slug vs "longswords" proficiency slug)
  if (profSlugs.has(equipSlug + "s")) return true;

  // Check category-based proficiency
  for (const [profSlug, cats] of Object.entries(PROF_TO_CATEGORIES)) {
    if (profSlugs.has(profSlug) && cats.some((c) => categorySlugs.has(c))) {
      return true;
    }
  }

  return false;
}

/**
 * Draconic ancestry map — maps dragon color to damage type and breath shape.
 */
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
