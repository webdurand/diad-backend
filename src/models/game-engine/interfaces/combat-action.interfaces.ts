/**
 * Spec 003 — Combat Action Registry types.
 *
 * Shape canônico de uma ação disponível a um participant (PC ou monstro).
 * O `CombatActionRegistry` enumera `ActionDescriptor[]` consultando resolvers
 * plugáveis por `kind` (weapon / spell / class-feature / generic / monster-action).
 */

export type ActionKind =
  | 'attack'
  | 'spell'
  | 'class-feature'
  | 'item'
  | 'generic';

export type ActionCost =
  | 'action'
  | 'bonus'
  | 'reaction'
  | 'free'
  | 'legendary';

export type TargetShape =
  | 'self'
  | 'single-creature'
  | 'multiple-creatures'
  | 'area-burst'
  | 'area-line'
  | 'none';

export type DisabledReason =
  | 'ACTION_ALREADY_USED'
  | 'BONUS_ACTION_ALREADY_USED'
  | 'REACTION_ALREADY_USED'
  | 'NO_USES_REMAINING'
  | 'NO_SLOT_AVAILABLE'
  | 'NOT_EQUIPPED'
  | 'WRONG_CLASS'
  | 'BELOW_REQUIRED_LEVEL'
  | 'NOT_YOUR_TURN'
  | 'PREREQUISITE_NOT_MET'
  | 'STEADY_AIM_MOVEMENT_USED';

export interface ActionCostMetadata {
  spellSlot?: { level: number };
  featureUses?: number;
  kiPoints?: number;
  reactionUse?: boolean;
}

export interface ActionDescriptorMetadata {
  /** Dado(s) de dano — ex: '1d8', '2d6'. */
  damageDice?: string;
  /** Tipo de dano — slashing, piercing, bludgeoning, fire, ... */
  damageType?: string;
  /** Requer concentração (spells). */
  requiresConcentration?: boolean;
  /** Casting time literal (p/ spells) — 'action' | 'bonus' | 'reaction' | string SRD. */
  castingTime?: string;
  /** Attacks restantes no turno (Extra Attack) para weapon-attack. */
  attacksRemainingThisTurn?: number;
  /** Sub-opções (ex: Unarmed Strike → ['damage','grapple','shove']). */
  subOptions?: string[];
  /** Slug da classe que concedeu a feature (para class-feature). */
  sourceClass?: string;
  /** Nível mínimo da classe para a feature. */
  requiredLevel?: number;
  /** Id do equipment source (para weapon attacks). */
  sourceEquipmentId?: string;
  /** Propriedade Weapon Mastery XPHB (sap|vex|topple|graze|cleave|flex|nick|push|slow). */
  masteryProperty?: string;
  /** Para monster actions — slug do monstro origem. */
  sourceMonsterSlug?: string;
}

/**
 * Entrada canônica da listagem pública (GET /characters/:id/actions,
 * GET /encounters/:id/participants/:pid/actions).
 */
export interface ActionDescriptor {
  /** Slug estável, kebab-case (ex: 'longsword-attack', 'unarmed-strike', 'second-wind'). */
  slug: string;
  displayName: string;
  kind: ActionKind;
  actionCost: ActionCost;
  available: boolean;
  disabledReason?: DisabledReason;
  targetShape: TargetShape;
  /** Range em pés. 5 para melee reach padrão. */
  targetRange?: number;
  cost?: ActionCostMetadata;
  metadata?: ActionDescriptorMetadata;
}

/**
 * Subset mínimo do CharacterSheet consumido pelos resolvers de PC.
 * Evita acoplar a interface de resolvers ao shape completo do sheet.
 */
export interface ResolverSheetSlice {
  /** Equipment com damage/armorClass/properties (apenas equipped é relevante para weapon attacks). */
  equipment: Array<{
    id: string;
    slug: string;
    name: string;
    equipped: boolean;
    damage?: Record<string, unknown>;
    range?: Record<string, unknown>;
    properties?: Record<string, unknown>;
  }>;
  /** Classes com slug normalizado e level — para class-feature resolver. */
  classes: Array<{ slug: string; name?: string; level: number }>;
  /** Features (ativáveis) — lista com slug + nível. */
  features?: Array<{ slug: string; name: string; level?: number; active?: boolean }>;
  /** Ability modifiers normalizados (str/dex/con/int/wis/cha → int). */
  abilityMods?: Partial<Record<string, number>>;
  /** Proficiency bonus do PC (para calcular attack bonus em descritores). */
  proficiencyBonus?: number;
  /** Total level (para features level-gated). */
  totalLevel?: number;
}

/**
 * Shape opaco passado aos resolvers — contém tudo o que eles precisam para decidir.
 * Evita acoplar os resolvers ao schema das entities (facilita testes unitários).
 */
export interface ParticipantContext {
  participantId?: string; // absent em contexto character-only
  type: 'pc' | 'monster' | 'npc';
  /** PC: id do CharacterEntity. Monster: id do MonsterEntity. */
  characterId?: string;
  monsterId?: string;
  /** Action economy corrente (ausente em contexto character-only). */
  actionEconomy?: {
    actionUsed: boolean;
    bonusActionUsed: boolean;
    reactionUsed: boolean;
    movementUsed: number; // em pés
    attacksUsedThisTurn: number;
    attacksMaxThisTurn: number;
    isOnTurn: boolean;
  };
  /** Conditions correntes (para gates como incapacitated). */
  conditions?: string[];
  /** Usos de feature consumidos (lido de CharacterState.feature_uses_used). */
  featureUsesUsed?: Record<string, number>;
  /** Sheet slice do PC (carregado uma vez pelo caller e compartilhado entre resolvers). */
  sheet?: ResolverSheetSlice;
  /** Monster statblock (para monster-action resolver). */
  monsterActions?: Array<{ name: string; desc?: string; attackBonus?: number; damageDice?: string; damageType?: string }>;
  monsterSlug?: string;
}
