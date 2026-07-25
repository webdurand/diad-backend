import type { ConditionSlug } from "../interfaces/combat.interfaces";

export type BlindnessDeafnessChoice = "blinded" | "deafened";

export function isBlindnessDeafnessChoice(
  value: unknown,
): value is BlindnessDeafnessChoice {
  return value === "blinded" || value === "deafened";
}

export function resolveSpellConditionSlug(
  spellSlug: string,
  defaultCondition: ConditionSlug,
  choice?: BlindnessDeafnessChoice,
): ConditionSlug | null {
  if (spellSlug !== "blindness-deafness") return defaultCondition;
  return isBlindnessDeafnessChoice(choice) ? choice : null;
}
