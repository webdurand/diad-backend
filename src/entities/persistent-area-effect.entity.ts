import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EncounterEntity } from './encounter.entity';
import type { SaveAbility } from '../models/game-engine/interfaces/combat.interfaces';

/**
 * Spec 004 — PersistentAreaEffect.
 *
 * Áreas que duram além do turno do caster: Spirit Guardians, Wall of Fire,
 * Cloud of Daggers, Moonbeam, Spike Growth.
 *
 * Ciclo de vida:
 * - Criação em `spell-casting.service` quando spell é AoE persistente.
 * - Tick de dano em `start-turn-orchestrator` para criaturas dentro da área.
 * - Decremento de duração no início de cada round.
 * - Remoção em cascata quando o caster quebra concentração ou morre
 *   (se `sourceConcentration=true`).
 */
@Entity('persistent_area_effects')
export class PersistentAreaEffectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'encounter_id', type: 'uuid' })
  encounterId: string;

  @ManyToOne(() => EncounterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'encounter_id' })
  encounter: EncounterEntity;

  /** Caster que originou; null = ambiental (lava, gás de covil). */
  @Column({
    name: 'caster_participant_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  casterParticipantId: string | null;

  @Column({ name: 'source_spell', type: 'varchar', length: 100 })
  sourceSpell: string;

  @Column({ name: 'shape_kind', type: 'varchar', length: 16 })
  shapeKind: 'sphere' | 'cube' | 'cylinder' | 'line' | 'cone';

  @Column({ name: 'origin_cell', type: 'jsonb' })
  originCell: { x: number; y: number };

  @Column({ name: 'radius_cells', type: 'int' })
  radiusCells: number;

  /** Notação de dado, ex: '3d8'. */
  @Column({ name: 'damage_dice', type: 'varchar', length: 16 })
  damageDice: string;

  @Column({ name: 'damage_type', type: 'varchar', length: 16 })
  damageType: string;

  @Column({ name: 'save_ability', type: 'varchar', length: 3, nullable: true })
  saveAbility: SaveAbility | null;

  @Column({ name: 'save_dc', type: 'int', nullable: true })
  saveDc: number | null;

  @Column({ name: 'half_on_save', type: 'boolean', default: false })
  halfOnSave: boolean;

  /** Rounds restantes; null = sem prazo (raríssimo). */
  @Column({ name: 'duration_rounds_remaining', type: 'int', nullable: true })
  durationRoundsRemaining: number | null;

  /** True se a área existe enquanto o caster mantém concentração. */
  @Column({ name: 'source_concentration', type: 'boolean', default: false })
  sourceConcentration: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
