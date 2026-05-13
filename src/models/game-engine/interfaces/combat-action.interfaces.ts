

export type ActionKind =
  | "attack"
  | "special"
  | "spell"
  | "class-feature"
  | "item"
  | "generic";

export type ActionCost = "action" | "bonus" | "reaction" | "free" | "legendary";

export type TargetShape =
  | "self"
  | "single-creature"
  | "multiple-creatures"
  | "area-burst"
  | "area-line"
  | "none";

export type DisabledReason =
  | "ACTION_ALREADY_USED"
  | "BONUS_ACTION_ALREADY_USED"
  | "REACTION_ALREADY_USED"
  | "NO_USES_REMAINING"
  | "NO_SLOT_AVAILABLE"
  | "NOT_EQUIPPED"
  | "WRONG_CLASS"
  | "BELOW_REQUIRED_LEVEL"
  | "NOT_YOUR_TURN"
  | "PREREQUISITE_NOT_MET"
  | "STEADY_AIM_MOVEMENT_USED";

export interface ActionCostMetadata {
  spellSlot?: { level: number };
  featureUses?: number;
  kiPoints?: number;
  reactionUse?: boolean;
}

export interface ActionDescriptorMetadata {

  damageDice?: string;

  damageType?: string;

  requiresConcentration?: boolean;

  castingTime?: string;

  attacksRemainingThisTurn?: number;

  subOptions?: string[];

  sourceClass?: string;

  requiredLevel?: number;

  sourceEquipmentId?: string;

  masteryProperty?: string;

  sourceMonsterSlug?: string;
}


export interface ActionDescriptor {

  slug: string;
  displayName: string;
  kind: ActionKind;
  actionCost: ActionCost;
  available: boolean;
  disabledReason?: DisabledReason;
  targetShape: TargetShape;

  targetRange?: number;
  cost?: ActionCostMetadata;
  metadata?: ActionDescriptorMetadata;
}


export interface ResolverSheetSlice {

  equipment: Array<{
    id: string;
    slug: string;
    name: string;
    equipped: boolean;
    damage?: Record<string, unknown>;
    range?: Record<string, unknown>;
    properties?: Record<string, unknown>;
  }>;

  classes: Array<{ slug: string; name?: string; level: number }>;

  features?: Array<{
    slug: string;
    name: string;
    level?: number;
    active?: boolean;
  }>;

  abilityMods?: Partial<Record<string, number>>;

  proficiencyBonus?: number;

  totalLevel?: number;
}


export interface ParticipantContext {
  participantId?: string;
  type: "pc" | "monster" | "npc";

  characterId?: string;
  monsterId?: string;

  actionEconomy?: {
    actionUsed: boolean;
    bonusActionUsed: boolean;
    reactionUsed: boolean;
    movementUsed: number;
    attacksUsedThisTurn: number;
    attacksMaxThisTurn: number;
    isOnTurn: boolean;
  };

  conditions?: string[];

  featureUsesUsed?: Record<string, number>;

  sheet?: ResolverSheetSlice;

  monsterActions?: Array<{
    name: string;
    desc?: string;
    attackBonus?: number;
    damageDice?: string;
    damageType?: string;
  }>;
  monsterSlug?: string;
}
