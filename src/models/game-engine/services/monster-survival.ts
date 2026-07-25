export interface UndeadFortitudeInput {
  specialAbilities: unknown;
  constitutionScore: number;
  damageTaken: number;
  damageType?: string | null;
  critical: boolean;
  roll: number;
}

export interface UndeadFortitudeResult {
  attempted: boolean;
  dc?: number;
  roll?: number;
  modifier?: number;
  total?: number;
  success?: boolean;
  blockedBy?: "critical" | "radiant";
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function hasUndeadFortitude(specialAbilities: unknown): boolean {
  const abilities = Array.isArray(specialAbilities)
    ? specialAbilities
    : specialAbilities && typeof specialAbilities === "object"
      ? Object.values(specialAbilities as Record<string, unknown>)
      : [];

  return abilities.some((ability) => {
    if (typeof ability === "string") {
      return normalize(ability).includes("undead fortitude");
    }
    if (!ability || typeof ability !== "object") return false;
    const record = ability as Record<string, unknown>;
    return (
      normalize(record.name).includes("undead fortitude") ||
      normalize(record.desc ?? record.description).includes(
        "undead fortitude",
      )
    );
  });
}

export function resolveUndeadFortitude(
  input: UndeadFortitudeInput,
): UndeadFortitudeResult {
  if (!hasUndeadFortitude(input.specialAbilities)) {
    return { attempted: false };
  }
  if (input.critical) {
    return { attempted: false, blockedBy: "critical" };
  }
  if (normalize(input.damageType) === "radiant") {
    return { attempted: false, blockedBy: "radiant" };
  }

  const dc = 5 + Math.max(0, Math.trunc(input.damageTaken));
  const modifier = Math.floor((input.constitutionScore - 10) / 2);
  const total = input.roll + modifier;
  return {
    attempted: true,
    dc,
    roll: input.roll,
    modifier,
    total,
    success: total >= dc,
  };
}
