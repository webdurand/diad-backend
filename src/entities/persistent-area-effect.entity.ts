import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { EncounterEntity } from "./encounter.entity";
import type { SaveAbility } from "../models/game-engine/interfaces/combat.interfaces";
import type {
  TileEffectKind,
  TileEffectOriginCell,
  TileEffectTrigger,
  TileEffectTactical,
} from "../models/game-engine/services/tile-effect-catalog";


@Entity("persistent_area_effects")
export class PersistentAreaEffectEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "encounter_id", type: "uuid" })
  encounterId: string;

  @ManyToOne(() => EncounterEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "encounter_id" })
  encounter: EncounterEntity;


  @Column({
    name: "caster_participant_id",
    type: "varchar",
    length: 36,
    nullable: true,
  })
  casterParticipantId: string | null;

  @Column({ name: "source_spell", type: "varchar", length: 100 })
  sourceSpell: string;

  @Column({ name: "shape_kind", type: "varchar", length: 16 })
  shapeKind: "sphere" | "cube" | "cylinder" | "line" | "cone";

  @Column({ name: "origin_cell", type: "jsonb" })
  originCell: TileEffectOriginCell;

  @Column({ name: "radius_cells", type: "int" })
  radiusCells: number;


  @Column({ name: "damage_dice", type: "varchar", length: 16 })
  damageDice: string;

  @Column({ name: "damage_type", type: "varchar", length: 16 })
  damageType: string;

  @Column({ name: "save_ability", type: "varchar", length: 3, nullable: true })
  saveAbility: SaveAbility | null;

  @Column({ name: "save_dc", type: "int", nullable: true })
  saveDc: number | null;

  @Column({ name: "half_on_save", type: "boolean", default: false })
  halfOnSave: boolean;


  @Column({ name: "duration_rounds_remaining", type: "int", nullable: true })
  durationRoundsRemaining: number | null;


  @Column({ name: "source_concentration", type: "boolean", default: false })
  sourceConcentration: boolean;








  @Column({ name: "effect_kind", type: "varchar", length: 32, nullable: true })
  effectKind: TileEffectKind | null;


  @Column({ name: "triggers", type: "jsonb", nullable: true })
  triggers: TileEffectTrigger[] | null;


  @Column({ name: "is_difficult_terrain", type: "boolean", default: false })
  isDifficultTerrain: boolean;


  @Column({ name: "speed_multiplier", type: "real", nullable: true })
  speedMultiplier: number | null;


  @Column({ name: "tactical_metadata", type: "jsonb", nullable: true })
  tacticalMetadata: TileEffectTactical | null;


  @Column({
    name: "narrative_descriptor",
    type: "varchar",
    length: 120,
    nullable: true,
  })
  narrativeDescriptor: string | null;


  @Column({ name: "slot_level", type: "int", nullable: true })
  slotLevel: number | null;


  @Column({ name: "aura_follows_caster", type: "boolean", default: false })
  auraFollowsCaster: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
