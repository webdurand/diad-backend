import type { ClassBlock } from "src/models/characters/services/character-sheet.service";

const INCAPACITATING_CONDITIONS = new Set([
  "incapacitated",
  "paralyzed",
  "petrified",
  "stunned",
  "unconscious",
]);

function normalizeClassSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/-(phb|xphb|srd52)$/, "");
}

interface EvasionFeature {
  slug?: string;
  active?: boolean;
}

export function hasEvasionFeature(
  classes: Pick<ClassBlock, "slug" | "level">[],
  conditions: string[],
  features: EvasionFeature[] = [],
): boolean {
  if (
    conditions.some((condition) =>
      INCAPACITATING_CONDITIONS.has(condition.trim().toLowerCase()),
    )
  ) {
    return false;
  }

  const hasCoreClassEvasion = classes.some((characterClass) => {
    const slug = normalizeClassSlug(characterClass.slug);
    return (
      (slug === "rogue" || slug === "monk") && characterClass.level >= 7
    );
  });
  if (hasCoreClassEvasion) return true;

  const isEligiblePhbHunter = classes.some(
    (characterClass) =>
      normalizeClassSlug(characterClass.slug) === "ranger" &&
      characterClass.level >= 15,
  );
  return (
    isEligiblePhbHunter &&
    features.some(
      (feature) =>
        feature.active !== false &&
        feature.slug?.trim().toLowerCase() ===
          "evasion-ranger-hunter-15-phb",
    )
  );
}

export interface EvasionDamageInput {
  damageAfterSave: number;
  saveAbility: string;
  saveSucceeded: boolean;
  halfDamageOnSuccess: boolean;
  hasEvasion: boolean;
}

export interface EvasionDamageResolution {
  applied: boolean;
  damageAfterEvasion: number;
}

export function resolveEvasionDamage(
  input: EvasionDamageInput,
): EvasionDamageResolution {
  const normalizedAbility = input.saveAbility
    .trim()
    .toLowerCase()
    .slice(0, 3);
  if (
    !input.hasEvasion ||
    normalizedAbility !== "dex" ||
    !input.halfDamageOnSuccess
  ) {
    return {
      applied: false,
      damageAfterEvasion: input.damageAfterSave,
    };
  }

  return {
    applied: true,
    damageAfterEvasion: input.saveSucceeded
      ? 0
      : Math.floor(input.damageAfterSave / 2),
  };
}
