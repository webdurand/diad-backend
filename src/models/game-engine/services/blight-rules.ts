export interface BlightTargetLike {
  creatureType?: string | null;
  monster?: { type?: string | null } | null;
}

export interface BlightCreatureRules {
  creatureType: string;
  hasNoEffect: boolean;
  saveHasDisadvantage: boolean;
  dealsMaximumDamage: boolean;
}

export function getBlightCreatureRules(
  target: BlightTargetLike,
): BlightCreatureRules {
  const creatureType = String(
    target.creatureType ?? target.monster?.type ?? "",
  ).toLowerCase();
  const hasNoEffect =
    creatureType.includes("undead") || creatureType.includes("construct");
  const isPlant = creatureType.includes("plant");
  return {
    creatureType,
    hasNoEffect,
    saveHasDisadvantage: isPlant,
    dealsMaximumDamage: isPlant,
  };
}

export function maximumDiceExpression(expression: string | undefined): number {
  if (!expression) return 0;
  const match = expression
    .trim()
    .match(/^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/i);
  if (!match) return 0;
  const modifier = Number(match[4] ?? 0);
  return (
    Number(match[1]) * Number(match[2]) +
    (match[3] === "-" ? -modifier : modifier)
  );
}
