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
}
