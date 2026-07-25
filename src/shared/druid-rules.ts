export function getWildShapeUses(
  druidLevel: number,
  is2024Rules = true,
): number {
  if (!is2024Rules) return druidLevel >= 20 ? 9999 : 2;
  if (druidLevel >= 17) return 4;
  if (druidLevel >= 6) return 3;
  return 2;
}

export function getWildShapeMaxCr(
  druidLevel: number,
  isMoonDruid: boolean,
): number {
  if (isMoonDruid && druidLevel >= 3) {
    return Math.max(1, Math.floor(druidLevel / 3));
  }
  if (druidLevel >= 8) return 1;
  if (druidLevel >= 4) return 0.5;
  return 0.25;
}

export function getWildShapeDurationRounds(druidLevel: number): number {
  const durationHours = Math.max(1, Math.floor(druidLevel / 2));
  return durationHours * 600;
}

export function getWildShapeTempHp(
  druidLevel: number,
  isMoonDruid: boolean,
): number {
  return Math.max(1, druidLevel * (isMoonDruid ? 3 : 1));
}

export const ELEMENTAL_FURY_CHOICES = [
  "primal-strike",
  "potent-spellcasting",
] as const;

export type ElementalFuryChoice = (typeof ELEMENTAL_FURY_CHOICES)[number];

export function normalizeElementalFuryChoice(
  value: unknown,
): ElementalFuryChoice | null {
  const raw =
    typeof value === "string"
      ? value
      : value && typeof value === "object"
        ? String(
            (value as Record<string, unknown>).option ??
              (value as Record<string, unknown>).choice ??
              (value as Record<string, unknown>).value ??
              "",
          )
        : "";
  const canonical = raw
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/-(?:druid-)?7$/, "");
  return ELEMENTAL_FURY_CHOICES.includes(
    canonical as ElementalFuryChoice,
  )
    ? (canonical as ElementalFuryChoice)
    : null;
}

export function isElementalFuryFeatureSlug(
  slug: string,
  choice: ElementalFuryChoice,
): boolean {
  const canonical = slug.toLowerCase();
  return canonical === choice || canonical.startsWith(`${choice}-`);
}
