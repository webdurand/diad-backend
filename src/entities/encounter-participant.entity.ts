import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { EncounterEntity } from "./encounter.entity";
import { CharacterEntity } from "./character.entity";
import { MonsterEntity } from "./monster.entity";
import type { ParticipantSpellSlotsUsed } from "../models/game-engine/interfaces/monster-typed";
import type {
  ReadiedAction,
  TurnExecutionResult,
  ConditionInstance,
  AppliedEffect,
  EffectInstance,
  RechargeState,
} from "../models/game-engine/interfaces/combat.interfaces";

@Entity("encounter_participants")
export class EncounterParticipantEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "encounter_id", type: "uuid" })
  encounterId: string;

  @ManyToOne(() => EncounterEntity, (e) => e.participants, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "encounter_id" })
  encounter: EncounterEntity;

  @Column({ type: "varchar" })
  type: "pc" | "monster" | "npc";

  @Column({ name: "character_id", type: "uuid", nullable: true })
  characterId?: string;

  @ManyToOne(() => CharacterEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "character_id" })
  character?: CharacterEntity;

  @Column({ name: "monster_id", type: "uuid", nullable: true })
  monsterId?: string;

  @ManyToOne(() => MonsterEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "monster_id" })
  monster?: MonsterEntity;

  @Column({ name: "display_name", type: "varchar" })
  displayName: string;

  @Column({ name: "initiative_roll", type: "int", nullable: true })
  initiativeRoll?: number;

  @Column({ name: "initiative_modifier", type: "int", nullable: true })
  initiativeModifier?: number;

  @Column({ name: "initiative_total", type: "int", nullable: true })
  initiativeTotal?: number;



  @Column({ name: "current_hp", type: "int", nullable: true })
  currentHp?: number;

  @Column({ name: "max_hp", type: "int", nullable: true })
  maxHp?: number;

  @Column({ name: "temp_hp", type: "int", default: 0 })
  tempHp: number;



  @Column({ type: "jsonb", default: [] })
  conditions: string[];

  @Column({ name: "is_concentrating", type: "boolean", default: false })
  isConcentrating: boolean;

  @Column({ name: "concentrating_on", type: "varchar", nullable: true })
  concentratingOn?: string;

  @Column({ name: "legendary_actions_used", type: "int", default: 0 })
  legendaryActionsUsed: number;

  @Column({ name: "reactions_used", type: "int", default: 0 })
  reactionsUsed: number;



  @Column({ name: "movement_remaining", type: "int", nullable: true })
  movementRemaining?: number;

  @Column({ name: "action_used", type: "boolean", default: false })
  actionUsed: boolean;

  @Column({ name: "bonus_action_used", type: "boolean", default: false })
  bonusActionUsed: boolean;

  @Column({ name: "has_dashed", type: "boolean", default: false })
  hasDashed: boolean;

  @Column({ name: "has_disengaged", type: "boolean", default: false })
  hasDisengaged: boolean;


  @Column({ name: "inspiration_armed", type: "boolean", default: false })
  inspirationArmed: boolean;





  @Column({ name: "attacks_used_this_turn", type: "int", default: 0 })
  attacksUsedThisTurn: number;


  @Column({ name: "attacks_max_this_turn", type: "int", default: 1 })
  attacksMaxThisTurn: number;


  @Column({ name: "reckless_attack_active", type: "boolean", default: false })
  recklessAttackActive: boolean;


  @Column({ name: "free_object_interactions_used", type: "int", default: 0 })
  freeObjectInteractionsUsed: number;


  @Column({ name: "indomitable_armed", type: "boolean", default: false })
  indomitableArmed: boolean;


  @Column({ name: "cleave_used_this_turn", type: "boolean", default: false })
  cleaveUsedThisTurn: boolean;


  @Column({ name: "nick_used_this_turn", type: "boolean", default: false })
  nickUsedThisTurn: boolean;


  @Column({
    name: "sneak_attack_used_this_turn",
    type: "boolean",
    default: false,
  })
  sneakAttackUsedThisTurn: boolean = false;


  @Column({
    name: "tactical_master_override",
    type: "varchar",
    length: 16,
    nullable: true,
  })
  tacticalMasterOverride: string | null;


  @Column({ name: "superiority_dice_used", type: "int", default: 0 })
  superiorityDiceUsed: number;


  @Column({ name: "relentless_rage_uses_used", type: "int", default: 0 })
  relentlessRageUsesUsed: number;


  @Column({ name: "sorcery_points_used", type: "int", default: 0 })
  sorceryPointsUsed: number;


  @Column({
    name: "sorcerous_restoration_used",
    type: "boolean",
    default: false,
  })
  sorcerousRestorationUsed: boolean;


  @Column({ name: "position_x", type: "int", nullable: true })
  positionX?: number;

  @Column({ name: "position_y", type: "int", nullable: true })
  positionY?: number;

  @Column({ name: "is_visible", type: "boolean", default: true })
  isVisible: boolean;

  @Column({ name: "is_defeated", type: "boolean", default: false })
  isDefeated: boolean;



  @Column({
    name: "dying_state",
    type: "varchar",
    length: 16,
    default: "none",
  })
  dyingState: "none" | "dying" | "stable" | "dead";




  @Column({
    name: "spell_slots_used",
    type: "jsonb",
    default: () => `'{}'`,
  })
  spellSlotsUsed: ParticipantSpellSlotsUsed;

  @Column({ type: "varchar", default: "enemy" })
  faction: "ally" | "enemy" | "neutral";






  @Column({
    name: "controlled_by",
    type: "varchar",
    length: 8,
    default: "pc",
  })
  controlledBy: "pc" | "ai" | "dm";


  @Column({
    name: "dodging_until_turn_of_participant_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  dodgingUntilTurnOfParticipantId: string | null;


  @Column({
    name: "helping_ally_participant_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  helpingAllyParticipantId: string | null;

  @Column({
    name: "helping_target_participant_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  helpingTargetParticipantId: string | null;


  @Column({
    name: "helping_until_turn_of_participant_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  helpingUntilTurnOfParticipantId: string | null;


  @Column({ name: "readied_action", type: "jsonb", nullable: true })
  readiedAction: ReadiedAction | null;


  @Column({ name: "last_ai_turn_round", type: "int", nullable: true })
  lastAiTurnRound: number | null;


  @Column({ name: "last_ai_turn_result", type: "jsonb", nullable: true })
  lastAiTurnResult: TurnExecutionResult | null;





  @Column({ name: "condition_instances", type: "jsonb", default: () => `'[]'` })
  conditionInstances: ConditionInstance[];


  @Column({
    name: "concentration_rounds_remaining",
    type: "int",
    nullable: true,
  })
  concentrationRoundsRemaining: number | null;


  @Column({ name: "concentration_save_dc", type: "int", nullable: true })
  concentrationSaveDc: number | null;


  @Column({ name: "applied_effects", type: "jsonb", default: () => `'[]'` })
  appliedEffects: AppliedEffect[];


  @Column({ name: "effect_instances", type: "jsonb", default: () => `'[]'` })
  effectInstances: EffectInstance[];


  @Column({ name: "legendary_points_available", type: "int", nullable: true })
  legendaryPointsAvailable: number | null;


  @Column({ name: "legendary_points_max", type: "int", nullable: true })
  legendaryPointsMax: number | null;


  @Column({ name: "recharge_state", type: "jsonb", default: () => `'{}'` })
  rechargeState: RechargeState;


  @Column({
    name: "grappled_by_participant_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  grappledByParticipantId: string | null;


  @Column({ name: "transformation_state", type: "jsonb", nullable: true })
  transformationState:
    | import("../models/game-engine/interfaces/transformation.interfaces").TransformationState
    | null = null;


  @Column({
    name: "linked_caster_participant_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  linkedCasterParticipantId: string | null = null;
}
