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

/** Default rules for 2014 (PHB) edition */
export const PHB_RULES: EditionRules = {
  subclassLevels: {
    cleric: 1,
    druid: 2,
    sorcerer: 1,
    warlock: 1,
    wizard: 2,
    default: 3,
  },
  casterTypes: {
    ranger: "known",
  },
  preparedFormulas: {
    paladin: "halfLevel+mod",
  },
  hasWeaponMastery: false,
  hasDivineOrder: false,
  hasPrimalOrder: false,
  backgroundGrantsFeat: false,
  backgroundGrantsAbilityBonuses: false,
  exhaustionVariant: "2014_six_levels",
  // Spec 005 — while PHB seed doesn't cover all (class, level) rows, resolve
  // missing features/classes through XPHB. Delivers correct level-up for PHB
  // PCs out of the box; spec 006 closes the seed gap later.
  featureFallbackSource: "XPHB",
  classFallbackSource: "XPHB",
};

/** Default rules for 2024 (XPHB) edition */
export const XPHB_RULES: EditionRules = {
  subclassLevels: {
    default: 3,
  },
  casterTypes: {
    ranger: "total_access",
  },
  preparedFormulas: {
    paladin: "level+mod",
  },
  hasWeaponMastery: true,
  hasDivineOrder: true,
  hasPrimalOrder: true,
  backgroundGrantsFeat: true,
  backgroundGrantsAbilityBonuses: true,
  exhaustionVariant: "2024_ten_levels",
};

/**
 * Get the subclass level for a class under given edition rules.
 * Falls back to the 'default' key, then to 3 if not defined.
 */
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
