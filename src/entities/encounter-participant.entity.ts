import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EncounterEntity } from './encounter.entity';
import { CharacterEntity } from './character.entity';
import { MonsterEntity } from './monster.entity';
import type { ParticipantSpellSlotsUsed } from '../models/game-engine/interfaces/monster-typed';
import type {
  ReadiedAction,
  TurnExecutionResult,
  ConditionInstance,
  AppliedEffect,
  RechargeState,
} from '../models/game-engine/interfaces/combat.interfaces';

@Entity('encounter_participants')
export class EncounterParticipantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'encounter_id', type: 'uuid' })
  encounterId: string;

  @ManyToOne(() => EncounterEntity, (e) => e.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'encounter_id' })
  encounter: EncounterEntity;

  @Column({ type: 'varchar' })
  type: 'pc' | 'monster' | 'npc';

  @Column({ name: 'character_id', type: 'uuid', nullable: true })
  characterId?: string;

  @ManyToOne(() => CharacterEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'character_id' })
  character?: CharacterEntity;

  @Column({ name: 'monster_id', type: 'uuid', nullable: true })
  monsterId?: string;

  @ManyToOne(() => MonsterEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'monster_id' })
  monster?: MonsterEntity;

  @Column({ name: 'display_name', type: 'varchar' })
  displayName: string;

  @Column({ name: 'initiative_roll', type: 'int', nullable: true })
  initiativeRoll?: number;

  @Column({ name: 'initiative_modifier', type: 'int', nullable: true })
  initiativeModifier?: number;

  @Column({ name: 'initiative_total', type: 'int', nullable: true })
  initiativeTotal?: number;

  // --- Monster combat state (PCs delegate to CharacterStateService) ---

  @Column({ name: 'current_hp', type: 'int', nullable: true })
  currentHp?: number;

  @Column({ name: 'max_hp', type: 'int', nullable: true })
  maxHp?: number;

  @Column({ name: 'temp_hp', type: 'int', default: 0 })
  tempHp: number;

  // V1: string[] (DM aplica/remove manualmente)
  // V2: ConditionInstance[] com sourceSpell, saveDc, saveAbility, duration, concentration tracking
  @Column({ type: 'jsonb', default: [] })
  conditions: string[];

  @Column({ name: 'is_concentrating', type: 'boolean', default: false })
  isConcentrating: boolean;

  @Column({ name: 'concentrating_on', type: 'varchar', nullable: true })
  concentratingOn?: string;

  @Column({ name: 'legendary_actions_used', type: 'int', default: 0 })
  legendaryActionsUsed: number;

  @Column({ name: 'reactions_used', type: 'int', default: 0 })
  reactionsUsed: number;

  // --- Movement & Action Economy (reset each turn) ---

  @Column({ name: 'movement_remaining', type: 'int', nullable: true })
  movementRemaining?: number;

  @Column({ name: 'action_used', type: 'boolean', default: false })
  actionUsed: boolean;

  @Column({ name: 'bonus_action_used', type: 'boolean', default: false })
  bonusActionUsed: boolean;

  @Column({ name: 'has_dashed', type: 'boolean', default: false })
  hasDashed: boolean;

  @Column({ name: 'has_disengaged', type: 'boolean', default: false })
  hasDisengaged: boolean;

  // --- Spec 003: Extra Attack counter ---
  // Ver migration 1776300000000-AddCombatActionRegistryFields.

  /**
   * Quantos weapon attacks já foram feitos neste turno. Reset em start-turn.
   * Quando `attacksUsedThisTurn === attacksMaxThisTurn`, `actionUsed` vai a true.
   */
  @Column({ name: 'attacks_used_this_turn', type: 'int', default: 0 })
  attacksUsedThisTurn: number;

  /**
   * Total de weapon attacks permitidos por action neste turno.
   * Computado em start-turn: Fighter L5+=2, L11+=3, L20=4; Monk L5+=2;
   * Paladin/Barb/Ranger L5+=2; default 1. Action Surge reseta `actionUsed` e permite
   * uma segunda rodada de até `attacksMaxThisTurn` attacks no mesmo turno.
   */
  @Column({ name: 'attacks_max_this_turn', type: 'int', default: 1 })
  attacksMaxThisTurn: number;

  /**
   * Spec 003 B-lite — Reckless Attack (Barbarian L2+).
   * Ativa até o fim do turno do próprio barbarian. Enquanto ativa:
   *  - attacks STR melee do barbarian ganham advantage (Spec 4)
   *  - attacks contra o barbarian ganham advantage (Spec 4)
   * Reset em start-turn.
   */
  @Column({ name: 'reckless_attack_active', type: 'boolean', default: false })
  recklessAttackActive: boolean;

  // Grid position for battle map
  @Column({ name: 'position_x', type: 'int', nullable: true })
  positionX?: number;

  @Column({ name: 'position_y', type: 'int', nullable: true })
  positionY?: number;

  @Column({ name: 'is_visible', type: 'boolean', default: true })
  isVisible: boolean; // DM can hide tokens from players

  @Column({ name: 'is_defeated', type: 'boolean', default: false })
  isDefeated: boolean;

  // Death save state for PCs. Monsters stay 'none' (their "death" uses isDefeated).
  // See migration 1774900000000-AddDyingStateToParticipant.
  @Column({
    name: 'dying_state',
    type: 'varchar',
    length: 16,
    default: 'none',
  })
  dyingState: 'none' | 'dying' | 'stable' | 'dead';

  // Spell slots consumed by this participant during the current encounter.
  // Monsters: tracks slotsByLevel/innateUses against `MonsterSpellcasting`.
  // PCs: ignored (slots live on CharacterState.spell_slots).
  @Column({
    name: 'spell_slots_used',
    type: 'jsonb',
    default: () => `'{}'`,
  })
  spellSlotsUsed: ParticipantSpellSlotsUsed;

  @Column({ type: 'varchar', default: 'enemy' })
  faction: 'ally' | 'enemy' | 'neutral';

  // --- Spec 003: controle (human/ai/dm) + estados de ações genéricas ---
  // Ver migration 1775000000000-AddControlAndReactionsToParticipant.

  /** Quem executa o turno deste participante: dono do PC (human), IA externa, ou DM. */
  @Column({
    name: 'controlled_by',
    type: 'varchar',
    length: 8,
    default: 'human',
  })
  controlledBy: 'human' | 'ai' | 'dm';

  /** Dodge — id do próprio ator; expira no início do seu próximo turno. */
  @Column({
    name: 'dodging_until_turn_of_participant_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  dodgingUntilTurnOfParticipantId: string | null;

  /** Help — aliado que recebe vantagem no próximo ataque contra o alvo escolhido. */
  @Column({
    name: 'helping_ally_participant_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  helpingAllyParticipantId: string | null;

  @Column({
    name: 'helping_target_participant_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  helpingTargetParticipantId: string | null;

  /** Ajuda expira no início do próximo turno do ajudante (este participante). */
  @Column({
    name: 'helping_until_turn_of_participant_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  helpingUntilTurnOfParticipantId: string | null;

  /** Ready — gatilho + ação armada. Consome reação quando dispara. */
  @Column({ name: 'readied_action', type: 'jsonb', nullable: true })
  readiedAction: ReadiedAction | null;

  /** Idempotência do `/ai-turn` — round em que IA rodou pela última vez. */
  @Column({ name: 'last_ai_turn_round', type: 'int', nullable: true })
  lastAiTurnRound: number | null;

  /** Idempotência do `/ai-turn` — resposta cacheada do último run no round. */
  @Column({ name: 'last_ai_turn_result', type: 'jsonb', nullable: true })
  lastAiTurnResult: TurnExecutionResult | null;

  // --- Spec 004: completude RAW ---
  // Ver migration 1776000000000-AddRawCombatCompleteness.

  /** ConditionInstance[] com fonte/DC/save/duração/concentração. Substitui `conditions: string[]` (coexistência por 1 release). */
  @Column({ name: 'condition_instances', type: 'jsonb', default: () => `'[]'` })
  conditionInstances: ConditionInstance[];

  /** Quantos rounds restam da magia de concentração ativa. Null se não concentrando. */
  @Column({ name: 'concentration_rounds_remaining', type: 'int', nullable: true })
  concentrationRoundsRemaining: number | null;

  /** DC base do save de concentração na magia ativa (ex: spell save DC do caster). */
  @Column({ name: 'concentration_save_dc', type: 'int', nullable: true })
  concentrationSaveDc: number | null;

  /** O que esta magia de concentração aplicou em alvos/área. Removido em cascata ao quebrar. */
  @Column({ name: 'applied_effects', type: 'jsonb', default: () => `'[]'` })
  appliedEffects: AppliedEffect[];

  /** Pontos lendários disponíveis (null para criaturas não-lendárias). */
  @Column({ name: 'legendary_points_available', type: 'int', nullable: true })
  legendaryPointsAvailable: number | null;

  /** Pool máximo de pontos lendários (default 3 para a maioria). */
  @Column({ name: 'legendary_points_max', type: 'int', nullable: true })
  legendaryPointsMax: number | null;

  /** Estado de recharge por habilidade ('available'|'used'), keyed por nome. */
  @Column({ name: 'recharge_state', type: 'jsonb', default: () => `'{}'` })
  rechargeState: RechargeState;

  /** Id do agarrador, quando este participante está com a condição `grappled`. */
  @Column({
    name: 'grappled_by_participant_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  grappledByParticipantId: string | null;
}
