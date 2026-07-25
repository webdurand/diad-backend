type CharacterResistanceSheet = {
  originDetails?: Record<string, unknown>;
};

export function getCharacterDamageResistances(
  sheet: CharacterResistanceSheet,
): string[] {
  const ancestry = sheet.originDetails?.draconicAncestry;
  if (!ancestry || typeof ancestry !== "object") return [];

  const damageType = (ancestry as Record<string, unknown>).damageType;
  return typeof damageType === "string" && damageType.trim().length > 0
    ? [damageType]
    : [];
}
