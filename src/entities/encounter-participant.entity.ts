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

  // --- Monster combat state (PCs delegate to CharacterStateService) ---

  @Column({ name: "current_hp", type: "int", nullable: true })
  currentHp?: number;

  @Column({ name: "max_hp", type: "int", nullable: true })
  maxHp?: number;

  @Column({ name: "temp_hp", type: "int", default: 0 })
  tempHp: number;

  // V1: string[] (DM aplica/remove manualmente)
  // V2: ConditionInstance[] com sourceSpell, saveDc, saveAbility, duration, concentration tracking
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

  // --- Movement & Action Economy (reset each turn) ---

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

  /**
   * Spec 012 — Heroic Inspiration "armed" pro próximo d20 test.
   * Player com `character_state.inspiration = true` pode setar isto via
   * `/arm-inspiration` pra que o próximo attack/save/check tenha advantage.
   * Consumido automaticamente no primeiro d20 test do participant (zera
   * aqui + zera `character_state.inspiration`).
   *
   * Persiste só dentro do encounter: se terminar sem usar, volta a
   * depender só do boolean da ficha.
   */
  @Column({ name: "inspiration_armed", type: "boolean", default: false })
  inspirationArmed: boolean;

  // --- Spec 003: Extra Attack counter ---
  // Ver migration 1776300000000-AddCombatActionRegistryFields.

  /**
   * Quantos weapon attacks já foram feitos neste turno. Reset em start-turn.
   * Quando `attacksUsedThisTurn === attacksMaxThisTurn`, `actionUsed` vai a true.
   */
  @Column({ name: "attacks_used_this_turn", type: "int", default: 0 })
  attacksUsedThisTurn: number;

  /**
   * Total de weapon attacks permitidos por action neste turno.
   * Computado em start-turn: Fighter L5+=2, L11+=3, L20=4; Monk L5+=2;
   * Paladin/Barb/Ranger L5+=2; default 1. Action Surge reseta `actionUsed` e permite
   * uma segunda rodada de até `attacksMaxThisTurn` attacks no mesmo turno.
   */
  @Column({ name: "attacks_max_this_turn", type: "int", default: 1 })
  attacksMaxThisTurn: number;

  /**
   * Spec 003 B-lite — Reckless Attack (Barbarian L2+).
   * Ativa até o fim do turno do próprio barbarian. Enquanto ativa:
   *  - attacks STR melee do barbarian ganham advantage (Spec 4)
   *  - attacks contra o barbarian ganham advantage (Spec 4)
   * Reset em start-turn.
   */
  @Column({ name: "reckless_attack_active", type: "boolean", default: false })
  recklessAttackActive: boolean;

  /**
   * RAW 2024 — free object interactions gastas no turno atual. Limite = 1
   * (draw OR stow weapon). Reset em start-turn. Se > 0, tentativas subsequentes
   * de draw/stow exigem uma action genuína (ou são rejeitadas até próximo turno).
   */
  @Column({ name: "free_object_interactions_used", type: "int", default: 0 })
  freeObjectInteractionsUsed: number;

  /**
   * Fighter L9 Indomitable (RAW 2024) — quando armado, próximo save failed
   * do PC é automaticamente rerolled com +fighter_level de bônus. Consome
   * `feature_uses_used['indomitable']`. Resetado após consumo, desarmar
   * manual, ou saída do encontro.
   */
  @Column({ name: "indomitable_armed", type: "boolean", default: false })
  indomitableArmed: boolean;

  /**
   * Weapon Mastery Cleave (RAW 2024) — hit melee com weapon Cleave causa
   * damage num 2º alvo adjacente. Limite 1×/turno. Reset em start-turn.
   */
  @Column({ name: "cleave_used_this_turn", type: "boolean", default: false })
  cleaveUsedThisTurn: boolean;

  /**
   * Weapon Mastery Nick (RAW 2024) — light weapon com Nick permite extra attack
   * dentro da Attack action (não consome bonus). Limite 1×/turno. Reset em start-turn.
   */
  @Column({ name: "nick_used_this_turn", type: "boolean", default: false })
  nickUsedThisTurn: boolean;

  /**
   * Rogue Sneak Attack (RAW 2024 XPHB) — 1/turn damage rider quando ataque
   * usa Finesse/Ranged weapon + (advantage OU ally adjacente ao alvo). Reset
   * em start-turn. Dice = Nd6 por classLevel (1d6 L1, +1d6 cada 2 levels, cap 10d6 L19).
   */
  @Column({
    name: "sneak_attack_used_this_turn",
    type: "boolean",
    default: false,
  })
  sneakAttackUsedThisTurn: boolean = false;

  /**
   * Fighter L9 Tactical Master (RAW 2024) — mastery alternativa armada
   * (push/sap/slow). Consumido no próximo attack (combat.service aplica
   * mastery alternativa em vez da original e limpa o override).
   */
  @Column({
    name: "tactical_master_override",
    type: "varchar",
    length: 16,
    nullable: true,
  })
  tacticalMasterOverride: string | null;

  /**
   * Battle Master (Fighter L3+ RAW 2024) — pool de Superiority Dice gastos.
   * Max: 4 (L3), 5 (L7), 6 (L15). Die: d8/d10/d12 (L3/10/18). Reset: 1 em
   * short rest, todos em long rest. BattleMasterService lê/escreve.
   */
  @Column({ name: "superiority_dice_used", type: "int", default: 0 })
  superiorityDiceUsed: number;

  /**
   * Barbarian L11 Relentless Rage (RAW 2024) — DC escala com uses (10 + 5×n).
   * Reset em long rest.
   */
  @Column({ name: "relentless_rage_uses_used", type: "int", default: 0 })
  relentlessRageUsesUsed: number;

  /**
   * Sorcerer L2+ Font of Magic (RAW 2024) — Sorcery Points pool gastos.
   * Max: classLevel (L2=2, L5=5, L10=10, L20=20). Incrementado por convert
   * SP→slot e metamagic (SP cost). Reset: all em long rest; L5 Sorcerous
   * Restoration 1/LR regain floor(max/2) em SR.
   */
  @Column({ name: "sorcery_points_used", type: "int", default: 0 })
  sorceryPointsUsed: number;

  /**
   * Sorcerer L5 Sorcerous Restoration (RAW 2024) — 1/LR uso em SR recupera
   * floor(classLevel/2) SP. Flag boolean (consumido até long rest).
   */
  @Column({
    name: "sorcerous_restoration_used",
    type: "boolean",
    default: false,
  })
  sorcerousRestorationUsed: boolean;

  // Grid position for battle map
  @Column({ name: "position_x", type: "int", nullable: true })
  positionX?: number;

  @Column({ name: "position_y", type: "int", nullable: true })
  positionY?: number;

  @Column({ name: "is_visible", type: "boolean", default: true })
  isVisible: boolean; // DM can hide tokens from players

  @Column({ name: "is_defeated", type: "boolean", default: false })
  isDefeated: boolean;

  // Death save state for PCs. Monsters stay 'none' (their "death" uses isDefeated).
  // See migration 1774900000000-AddDyingStateToParticipant.
  @Column({
    name: "dying_state",
    type: "varchar",
    length: 16,
    default: "none",
  })
  dyingState: "none" | "dying" | "stable" | "dead";

  // Spell slots consumed by this participant during the current encounter.
  // Monsters: tracks slotsByLevel/innateUses against `MonsterSpellcasting`.
  // PCs: ignored (slots live on CharacterState.spell_slots).
  @Column({
    name: "spell_slots_used",
    type: "jsonb",
    default: () => `'{}'`,
  })
  spellSlotsUsed: ParticipantSpellSlotsUsed;

  @Column({ type: "varchar", default: "enemy" })
  faction: "ally" | "enemy" | "neutral";

  // --- Spec 003/006: controle (pc/ai/dm) + estados de ações genéricas ---
  // Ver migration 1775000000000-AddControlAndReactionsToParticipant.
  // Spec 006: 'human' renomeado para 'pc' via migration 1776600000000.

  /** Quem executa o turno deste participante: dono do PC (pc), IA externa, ou DM. */
  @Column({
    name: "controlled_by",
    type: "varchar",
    length: 8,
    default: "pc",
  })
  controlledBy: "pc" | "ai" | "dm";

  /** Dodge — id do próprio ator; expira no início do seu próximo turno. */
  @Column({
    name: "dodging_until_turn_of_participant_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  dodgingUntilTurnOfParticipantId: string | null;

  /** Help — aliado que recebe vantagem no próximo ataque contra o alvo escolhido. */
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

  /** Ajuda expira no início do próximo turno do ajudante (este participante). */
  @Column({
    name: "helping_until_turn_of_participant_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  helpingUntilTurnOfParticipantId: string | null;

  /** Ready — gatilho + ação armada. Consome reação quando dispara. */
  @Column({ name: "readied_action", type: "jsonb", nullable: true })
  readiedAction: ReadiedAction | null;

  /** Idempotência do `/ai-turn` — round em que IA rodou pela última vez. */
  @Column({ name: "last_ai_turn_round", type: "int", nullable: true })
  lastAiTurnRound: number | null;

  /** Idempotência do `/ai-turn` — resposta cacheada do último run no round. */
  @Column({ name: "last_ai_turn_result", type: "jsonb", nullable: true })
  lastAiTurnResult: TurnExecutionResult | null;

  // --- Spec 004: completude RAW ---
  // Ver migration 1776000000000-AddRawCombatCompleteness.

  /** ConditionInstance[] com fonte/DC/save/duração/concentração. Substitui `conditions: string[]` (coexistência por 1 release). */
  @Column({ name: "condition_instances", type: "jsonb", default: () => `'[]'` })
  conditionInstances: ConditionInstance[];

  /** Quantos rounds restam da magia de concentração ativa. Null se não concentrando. */
  @Column({
    name: "concentration_rounds_remaining",
    type: "int",
    nullable: true,
  })
  concentrationRoundsRemaining: number | null;

  /** DC base do save de concentração na magia ativa (ex: spell save DC do caster). */
  @Column({ name: "concentration_save_dc", type: "int", nullable: true })
  concentrationSaveDc: number | null;

  /** O que esta magia de concentração aplicou em alvos/área. Removido em cascata ao quebrar. */
  @Column({ name: "applied_effects", type: "jsonb", default: () => `'[]'` })
  appliedEffects: AppliedEffect[];

  /**
   * Spec 004 — Effect carrier.
   * Effects mecânicos aplicados a este participant (ac_bonus de Mage Armor,
   * attack_bonus de Bless, grant_advantage_to_attackers de Guiding Bolt, etc).
   * Separado de `appliedEffects` por SRP. Ver migration 1776400000000.
   */
  @Column({ name: "effect_instances", type: "jsonb", default: () => `'[]'` })
  effectInstances: EffectInstance[];

  /** Pontos lendários disponíveis (null para criaturas não-lendárias). */
  @Column({ name: "legendary_points_available", type: "int", nullable: true })
  legendaryPointsAvailable: number | null;

  /** Pool máximo de pontos lendários (default 3 para a maioria). */
  @Column({ name: "legendary_points_max", type: "int", nullable: true })
  legendaryPointsMax: number | null;

  /** Estado de recharge por habilidade ('available'|'used'), keyed por nome. */
  @Column({ name: "recharge_state", type: "jsonb", default: () => `'{}'` })
  rechargeState: RechargeState;

  /** Id do agarrador, quando este participante está com a condição `grappled`. */
  @Column({
    name: "grappled_by_participant_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  grappledByParticipantId: string | null;

  /**
   * Spec 012 — Transformation pipeline.
   * Snapshot do estado original + overlay do form ativo quando o participant
   * está transformado (Wild Shape, Polymorph, Form of Dread, etc).
   * Null = não-transformado. Ver TransformationService.
   */
  @Column({ name: "transformation_state", type: "jsonb", nullable: true })
  transformationState:
    | import("../models/game-engine/interfaces/transformation.interfaces").TransformationState
    | null = null;

  /**
   * Spec 012 — Summoning pipeline.
   * FK pro caster quando este participant é uma criação dele (summon,
   * duplicate, illusion). Permite cleanup em cascata quando caster morre ou
   * perde concentração. Null = participant autônomo.
   */
  @Column({
    name: "linked_caster_participant_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  linkedCasterParticipantId: string | null = null;
}
