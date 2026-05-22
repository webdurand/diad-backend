
export interface EditionRules {

  subclassLevels?: Record<string, number>;


  casterTypes?: Record<string, string>;


  preparedFormulas?: Record<string, "level+mod" | "halfLevel+mod">;


  hasWeaponMastery?: boolean;


  hasDivineOrder?: boolean;


  hasPrimalOrder?: boolean;


  backgroundGrantsFeat?: boolean;


  backgroundGrantsAbilityBonuses?: boolean;


  exhaustionVariant?:
    | "2014_six_levels"
    | "2024_six_levels"
    | "2024_ten_levels";


  featureFallbackSource?: string;


  classFallbackSource?: string;
}

export function getSubclassLevel(
  classSlug: string,
  rules?: EditionRules,
): number {
  if (!rules?.subclassLevels) return 3;
  return (
    rules.subclassLevels[classSlug] ?? rules.subclassLevels["default"] ?? 3
  );
}


export function getCasterTypeOverride(
  classSlug: string,
  rules?: EditionRules,
): string | undefined {
  return rules?.casterTypes?.[classSlug];
}


export function getPreparedFormula(
  classSlug: string,
  rules?: EditionRules,
): "level+mod" | "halfLevel+mod" | undefined {
  return rules?.preparedFormulas?.[classSlug];
}
