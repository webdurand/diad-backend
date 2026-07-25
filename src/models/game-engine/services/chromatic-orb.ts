export const CHROMATIC_ORB_DAMAGE_TYPES = [
  "acid",
  "cold",
  "fire",
  "lightning",
  "poison",
  "thunder",
] as const;

export type ChromaticOrbDamageType =
  (typeof CHROMATIC_ORB_DAMAGE_TYPES)[number];

export function isChromaticOrbDamageType(
  value: unknown,
): value is ChromaticOrbDamageType {
  return (
    typeof value === "string" &&
    (CHROMATIC_ORB_DAMAGE_TYPES as readonly string[]).includes(value)
  );
}

export function chromaticOrbDamageExpression(slotLevel: number): string {
  return `${Math.max(3, slotLevel + 2)}d8`;
}

export function chromaticOrbRollCanLeap(rolls: number[]): boolean {
  return new Set(rolls).size < rolls.length;
}
