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

  // Grid position for battle map
  @Column({ name: 'position_x', type: 'int', nullable: true })
  positionX?: number;

  @Column({ name: 'position_y', type: 'int', nullable: true })
  positionY?: number;

  @Column({ name: 'is_visible', type: 'boolean', default: true })
  isVisible: boolean; // DM can hide tokens from players

  @Column({ name: 'is_defeated', type: 'boolean', default: false })
  isDefeated: boolean;

  @Column({ type: 'varchar', default: 'enemy' })
  faction: 'ally' | 'enemy' | 'neutral';
}
