import { DiceResult, AdvantageResult } from "./dice.interfaces";
import type { AreaEffect } from "src/shared/aoe-origin.types";

export interface AttackRollResult {
  roll: number;
  modifier: number;
  total: number;
  targetAc: number;
  hit: boolean;
  critical: boolean;
  criticalMiss: boolean;
  advantage?: AdvantageResult;

  hasAdvantage?: boolean;
  hasDisadvantage?: boolean;
  advantageCancelled?: boolean;

  effectBonuses?: Array<{ source: string; dice?: string; amount?: number }>;
  halflingLuckRerolls?: Array<{
    die: "normal" | "first" | "second";
    original: 1;
    rerolled: number;
  }>;
}

export interface DamageRollResult {
  rolls: DiceResult[];
  bonus: number;
  total: number;
  type: string;
  resisted: boolean;
  immune: boolean;
  vulnerable: boolean;
  finalDamage: number;
}

export interface AttackResult {
  attackRoll: AttackRollResult;
  damageRoll?: DamageRollResult;
  targetHpBefore?: number;
  targetHpAfter?: number;
  targetDefeated: boolean;
  concentrationBroken?: boolean;
  radiantStrikesDamage?: number;
  divineSmiteAvailable?: boolean;
  divineSmiteTargetParticipantId?: string;
  divineSmiteSlotLevels?: number[];
  divineSmiteFreeCastAvailable?: boolean;
  divineSmiteCritical?: boolean;
  openHandTechniqueAvailable?: boolean;
  openHandTargetParticipantId?: string;
  giantAncestryAvailable?: boolean;
  giantAncestryFeatureSlug?: string;
  giantAncestryTargetParticipantId?: string;
}

export interface SavingThrowResult {
  ability: string;
  dc: number;
  roll: number;
  modifier: number;
  total: number;
  success: boolean;
  advantage?: AdvantageResult;
  auraBonus?: number;
  halfCoverBonus?: number;
  effectBonus?: number;
  exhaustionPenalty?: number;

  indomitableReroll?: {
    originalRoll: number;
    newRoll: number;
    fighterLevel: number;
  };
  halflingLuckRerolls?: Array<{
    die: "normal" | "first" | "second";
    original: 1;
    rerolled: number;
  }>;
}

export interface ConcentrationCheckResult {
  dc: number;
  roll: number;
  modifier: number;
  total: number;
  maintained: boolean;
  spellName?: string;
}

export interface DeathSaveResult {
  roll: number;
  naturalOne: boolean;
  naturalTwenty: boolean;
  successes: number;
  failures: number;

  dyingState: "none" | "dying" | "stable" | "dead";

  stabilized: boolean;

  dead: boolean;

  revivedHp: number | null;
}

export interface TurnInfo {
  encounterId: string;
  round: number;
  participantId: string;
  participantName: string;
  participantType: "pc" | "monster" | "npc";
  isDefeated: boolean;

  dyingState?: "none" | "dying" | "stable" | "dead";

  autoSkip?: boolean;
}

export interface RoundInfo {
  encounterId: string;
  round: number;
  firstParticipantId: string;
}

export interface AttackModifiers {
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  autoFail: boolean;
  autoCrit: boolean;
}

export interface DefenseModifiers {
  attacksHaveAdvantage: boolean;
  attacksHaveDisadvantage: boolean;
  autoHit: boolean;
  autoCritIfMelee: boolean;
}

export interface SaveModifiers {
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  autoFail: boolean;
}

export interface ConditionTurnEffect {
  condition: string;
  effect: string;
  description: string;
}


export type { AoEShape } from "src/shared/aoe-origin.types";

export interface TurnActionBlock {
  id: string;
  name: string;
  timing: string;
  source: string;
  sourceLabel: string;
  description: string;

  kind?:
    | "multiattack"
    | "spell-opener"
    | "attack"
    | "sustained-spell"
    | "relocate-area"
    | "familiar-action"
    | "steed-gift"
    | "condition-escape"
    | "wake-hypnotized";
  attackBonus?: number;
  damage?: { dice: string; type: string; bonus?: number };
  secondarySaveDamage?: {
    save: {
      ability: string;
      dc: number;
      halfOnSuccess: boolean;
    };
    damage: {
      dice: string;
      type: string;
    };
  };
  range?: string;
  spellLevel?: number;
  requiresConcentration?: boolean;
  automationStatus?: "ready";
  behaviorKind?:
    | "attack_damage"
    | "save_damage"
    | "healing"
    | "buff"
    | "condition"
    | "mark"
    | "persistent_area"
    | "summon";
  automationTags?: string[];

  aoe?: AreaEffect;

  save?: {
    ability: string;
    dc: number;
    halfOnSuccess?: boolean;
  };

  sequence?: Array<{ actionName: string; count: number }>;

  rechargeRequired?: "4-6" | "5-6" | "6" | null;

  featureSlug?: string;

  weaponSlug?: string;
  itemSlug?: string;

  masterySlug?: string;

  proficient?: boolean;

  handSlot?: "main" | "off" | null;

  uses?: number;

  usesMax?: number;

  usesRecharge?: string;

  wildResurgenceSlotRecoveryUsed?: boolean;

  wildResurgenceTurnRecoveryUsed?: boolean;

  faithfulSteedFreeCastUsed?: boolean;

  targetParticipantId?: string;

  spellSlug?: string;

  deliverThroughFamiliar?: boolean;

  targetingOriginParticipantId?: string;
}

export interface AoEResolveResult {
  affectedParticipantIds: string[];
  results: Array<{
    participantId: string;
    participantName: string;
    save?: SavingThrowResult;
    damageRoll?: DamageRollResult;
    targetHpAfter?: number;
    targetDefeated: boolean;
    conditionsApplied?: ConditionSlug[];
    forcedMovement?: {
      from: { x: number; y: number };
      to: { x: number; y: number };
      distanceFt: number;
    };
  }>;
}

export interface TurnActionsResult {
  participantId: string;
  participantName: string;
  participantType: "pc" | "monster" | "npc";

  actions: TurnActionBlock[];

  genericActions?: TurnActionBlock[];
  bonusActions: TurnActionBlock[];
  reactions: TurnActionBlock[];
  freeActions: TurnActionBlock[];
  canMove: boolean;
  remainingMovement: number;
  speed: number;
  canTakeAction: boolean;
  actionBlockedBy?: string;
  actionUsed: boolean;
  bonusActionUsed: boolean;
  reactionUsed: boolean;
  attacksUsedThisTurn: number;
  attacksMaxThisTurn: number;
  bonusUnarmedAttacksRemainingThisTurn: number;
  freeObjectInteractionUsed: boolean;
  hasDisengaged: boolean;
  hasDashed: boolean;
  hasteActionAvailable: boolean;
}






export type ReadyTrigger =
  | { kind: "enemy_enters_range"; rangeFt: number }
  | { kind: "enemy_attacks_ally"; allyParticipantId: string };


export interface ReadiedAction {
  trigger: ReadyTrigger;
  actionDescriptor: PlannedActionStep;
  armedAtTurnOfParticipantId: string;
}


export interface HelpingState {
  allyParticipantId: string;
  targetParticipantId: string;
  expiresAtNextTurnOfParticipantId: string;
}


export type PlannedActionStep =
  | { kind: "stand-up" }
  | { kind: "move"; to: { x: number; y: number } }
  | { kind: "attack"; actionName: string; targetParticipantIds: string[] }
  | {
      kind: "cast-spell";
      spellSlug: string;
      slotLevel?: number;
      targetParticipantIds?: string[];
      point?: { x: number; y: number };
    }
  | { kind: "dodge"; asBonusAction?: boolean }
  | { kind: "dash"; asBonusAction?: boolean }
  | { kind: "disengage"; asBonusAction?: boolean }
  | { kind: "help"; allyParticipantId: string; targetParticipantId: string }
  | { kind: "hide"; asBonusAction?: boolean }
  | { kind: "ready"; trigger: ReadyTrigger; readiedAction: PlannedActionStep }
  | {
      kind: "search";
      ability: "perception" | "investigation";
      searchSense?: "sight" | "hearing" | "other";
    }
  | {
      kind: "use-object";
      objectRef: {
        source: "inventory" | "environment";
        slug: string;
        itemId?: string;
      };
    }
  | { kind: "escape-web" }
  | { kind: "flee-fear" }
  | { kind: "wake-hypnotized"; targetParticipantId: string }
  | { kind: "end-turn" };


export interface ActionStep {
  kind: PlannedActionStep["kind"];
  payload: Record<string, unknown>;
  result: {
    ok: boolean;
    summary: string;
    events: Array<{ type: string; [k: string]: unknown }>;
    error?: { code: string; message: string };
  };
  timestamp: string;
}


export interface TurnExecutionResult {
  steps: ActionStep[];
  finalState: {
    actionUsed: boolean;
    bonusUsed: boolean;
    movementRemaining: number;
    reactionUsed: boolean;
    hp: { current: number; max: number };
    conditions: string[];
    dyingState: "none" | "dying" | "stable" | "dead";
  };
  llmCostUsd?: number;
  tookMs: number;
  rationale?: string;
}





export type ConditionSlug =
  | "blinded"
  | "charmed"
  | "deafened"
  | "frightened"
  | "grappled"
  | "incapacitated"
  | "invisible"
  | "paralyzed"
  | "petrified"
  | "poisoned"
  | "prone"
  | "restrained"
  | "stunned"
  | "unconscious"
  | "exhaustion"
  | "hidden"
  | "haste_lethargy"
  | "hypnotized"
  | "banished"
  | "truth_bound";

export type SaveAbility = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type RepeatSaveTiming = "end_of_turn" | "start_of_turn" | "never";


export type ConditionSource =
  | "manual"
  | "hp_zero"
  | `spell:${string}`
  | `feature:${string}`
  | `ability:${string}`
  | `environment:${string}`;


export interface ConditionInstance {

  id: string;
  slug: ConditionSlug;

  appliedBy: string | null;

  sourceSpell: string | null;

  sourceConcentration: boolean;

  source: ConditionSource;
  saveAbility: SaveAbility | null;
  saveDc: number | null;
  repeatSaveTiming: RepeatSaveTiming;

  durationRoundsRemaining: number | null;

  /**
   * Some effects expire at the end of a specific creature's turn instead of
   * on the global round boundary (for example, Find Steed's Fell Glare).
   */
  expiresAtTurnEndParticipantId?: string | null;

  level?: number;
  appliedAt: string;
}

export type AppliedEffectKind =
  | "condition"
  | "persistent-area"
  | "effect-instance"
  | "summon";


export interface AppliedEffect {
  kind: AppliedEffectKind;



  refId: string;

  targetParticipantId: string | null;

  description: string;
  movementCostFt?: number;

  metadata?: Record<string, unknown>;
}





export type EffectInstanceKind =
  | "ac_bonus"
  | "ac_base_override"
  | "attack_bonus"
  | "attack_penalty"
  | "save_bonus"
  | "save_penalty"
  | "damage_bonus"
  | "damage_resistance"
  | "grant_advantage_to_attackers"
  | "grant_disadvantage_to_attackers"
  | "self_advantage"
  | "self_disadvantage"
  | "self_advantage_next_attack"
  | "self_disadvantage_next_attack"
  | "speed_reduction"
  | "speed_bonus"
  | "healing_blocked"
  | "opportunity_attacks_blocked"
  | "hp_shield"
  | "statblock_swap"
  | "inspiration_die"
  | "flight_speed"
  | "speed_multiplier"
  | "extra_action"
  | "true_sight"
  | "damage_immunity_threshold"
  | "hex_mark"
  | "hunter_mark"
  | "foe_slayer_used_this_turn"
  | "bardic_inspiration"
  | "bane"
  | "bless"
  | "capstone_start_combat_done"
  | "eldritch_master_used_this_rest"
  | "stroke_of_luck_armed_attack"
  | "stroke_of_luck_armed_check"
  | "stroke_of_luck_used_this_rest"
  | "holy_nimbus_armed"
  | "wild_resurgence_slot_to_wild_shape_used_turn"
  | "spell_mastery_slot_free"
  | "signature_spell_used_this_rest"
  | "call_lightning_active"
  | "summoning_ritual"
  | "familiar_shared_senses"
  | "open_hand_flurry_attacks"
  | "open_hand_technique_pending"
  | "deflect_attacks_pending"
  | "uncanny_dodge_pending"
  | "cunning_strike_pending"
  | "divine_smite_pending"
  | "aura_half_cover"
  | "protection_from_evil_good"
  | "hit_point_maximum_bonus"
  | "giant_ancestry_hit_pending"
  | "giant_ancestry_reaction_pending"
  | "druid_hit_rider_pending"
  | "primal_strike_used_this_turn"
  | "lunar_radiance_used_this_turn"
  | "celestial_revelation"
  | "celestial_revelation_used_turn"
  | "abjure_foes_turn_choice"
  | "disintegrated"
  | "tile_effect_entry_marker"
  | "tile_effect_turn_trigger_marker";

export type EffectExpirationKind =
  | "rounds"
  | "turns"
  | "concentration"
  | "until_caster_turn"
  | "until_target_turn"
  | "caster_turn_ends"
  | "until_consumed"
  | "end_of_encounter";

export interface EffectInstancePayload {
  amount?: number;
  diceExpression?: string;
  slotLevel?: number;
  saveDc?: number;
  damageTypes?: string[];
  creatureTypes?: string[];
  beastSlug?: string;
  absorptionHp?: number;
  reason?: string;
  triggerEventId?: string;
  attackerParticipantId?: string;
  turnParticipantIdAtTrigger?: string;
  incomingDamage?: number;
  damageType?: string;
  hpBefore?: number;
  hpAfter?: number;
  maxHpBefore?: number;
  maxHpAfter?: number;
  tempHpBefore?: number;
  tempHpAfter?: number;
  isMeleeAttack?: boolean;
  minimumReduction?: number;
  maximumReduction?: number;
  focusRemaining?: number;
  sneakAttackDice?: string;
  sneakAttackRolls?: number[];
  sneakAttackCritical?: boolean;
  cunningStrikeOptions?: string[];
  targetHpAfterAttack?: number;
  wasHiddenBeforeAttack?: boolean;
  hitWasCritical?: boolean;
  sourceEdition?: string;
  weaponSlug?: string;
  scope?: "any" | "melee" | "ranged" | "str-check" | "str-save" | "dex-save";

  requiredTargetId?: string;

  masterySlug?: string;

  riderDice?: string;

  riderType?: string;

  areaId?: string;

  turnKey?: string;

  usedThisTurn?: boolean;

  consumeOn?: "targeted_by_attack";

  ritualGroupId?: string;
  ritualParticipantIds?: string[];
  ritualProgress?: number;
  ritualLastRound?: number;

  familiarParticipantId?: string;
  familiarName?: string;
  size?: string;
  usesRemaining?: number;
  usesMax?: number;
  primalStrikeAvailable?: boolean;
  lunarRadianceAvailable?: boolean;
  lunarRadianceDice?: string;
  form?: "heavenly-wings" | "inner-radiance" | "necrotic-shroud";
  extraDamageAmount?: number;
  targetParticipantId?: string;
  frightenedTargetIds?: string[];
  fearSourceTurnsRemaining?: number;
  abjureFoesTurnChoice?: "movement" | "action" | "bonus";
  brightLightRadiusFt?: number;
  dimLightRadiusFt?: number;
  radiusFeet?: number;
  armorClassBonus?: number;
  dexteritySaveBonus?: number;
}


export interface EffectInstance {
  id: string;
  sourceSpellSlug?: string;
  sourceFeatureSlug?: string;

  sourceCasterParticipantId: string;
  kind: EffectInstanceKind;
  payload: EffectInstancePayload;
  expiresAt: {
    kind: EffectExpirationKind;
    value?: number;
  };

  requiresConcentration: boolean;
  appliedAt: string;
}

export interface LairAction {
  name: string;
  description: string;
  rangeFt?: number;
  saveAbility?: SaveAbility;
  saveDc?: number;
  damageDice?: string;
  damageType?: string;
  appliesCondition?: ConditionSlug;

  createsPersistentArea?: {
    shapeKind: "sphere" | "cube" | "cylinder" | "line" | "cone";
    radiusCells: number;
    damageDice: string;
    damageType: string;
    durationRoundsRemaining: number;
    halfOnSave: boolean;
  };

  halfOnSave?: boolean;
}

export interface LegendaryActionStatblock {
  name: string;
  description: string;
  cost: 1 | 2 | 3;
  resolverHint: "attack" | "save" | "movement" | "special";
}

export type RechargeState = Record<string, "available" | "used">;

export interface DamageInstance {
  type: string;
  amount: number;
}

export interface ApplyDamageOptions {
  ignoreResistance?: boolean;
  ignoreImmunity?: boolean;
}

export interface DamageProfile {
  resistances: string[];
  immunities: string[];
  vulnerabilities: string[];
}

export interface ResistanceApplyResult {
  finalDamage: number;
  perPartFinal: Array<
    DamageInstance & {
      afterModifier: number;
      modifier: "resist" | "immune" | "vuln" | "none";
    }
  >;
}
