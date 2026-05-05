/**
 * Edition-specific rules/capabilities.
 * Each comp_source can define these to control game mechanics branching.
 * Adding a new ruleset only requires populating this data — no code changes.
 */
export interface EditionRules {
  /** Level at which each class gains a subclass. Default = 3 for unlisted classes. */
  subclassLevels?: Record<string, number>;

  /** Override caster type per class (e.g., ranger: 'total_access' for 2024) */
  casterTypes?: Record<string, string>;

  /** Override prepared spell formula per class */
  preparedFormulas?: Record<string, "level+mod" | "halfLevel+mod">;

  /** Whether this edition supports weapon mastery */
  hasWeaponMastery?: boolean;

  /** Whether Cleric has Divine Order feature */
  hasDivineOrder?: boolean;

  /** Whether Druid has Primal Order feature */
  hasPrimalOrder?: boolean;

  /** Whether backgrounds grant a feat */
  backgroundGrantsFeat?: boolean;

  /** Whether backgrounds grant ability score bonuses */
  backgroundGrantsAbilityBonuses?: boolean;

  /** Spec 004 CP9 — qual sistema de exhaustion aplicar:
   *  - '2014_six_levels': 6 níveis com efeitos discretos (PHB Apêndice A)
   *  - '2024_ten_levels': 10 níveis com -2×level em d20s e -5×level em speed (XPHB)
   *  Default: '2014_six_levels' se não especificado.
   */
  exhaustionVariant?: "2014_six_levels" | "2024_ten_levels";

  /**
   * Spec 005 — Source code (CompSourceEntity.code) a consultar quando
   * LevelEntity(class_id, level) da edição atual não existe. Ex: PHB.rules =
   * 'XPHB' permite Fighter PHB subir L2 mesmo com gap de seed. Omitido na
   * fonte default (XPHB).
   */
  featureFallbackSource?: string;

  /**
   * Spec 005 — Source consultada quando um classSlug pedido para multiclass
   * não tem ClassEntity nativa na edição do PC. Ex: PC PHB tentando multiclass
   * em artificer (só XPHB). Omitido se desabilitado.
   */
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

/**
 * Get the caster type override for a class, or undefined if no override.
 */
export function getCasterTypeOverride(
  classSlug: string,
  rules?: EditionRules,
): string | undefined {
  return rules?.casterTypes?.[classSlug];
}

/**
 * Get the prepared spell formula for a class, or undefined if no override.
 */
export function getPreparedFormula(
  classSlug: string,
  rules?: EditionRules,
): "level+mod" | "halfLevel+mod" | undefined {
  return rules?.preparedFormulas?.[classSlug];
}
