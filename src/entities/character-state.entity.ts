import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { CharacterEntity } from "./character.entity";

@Entity("character_state")
export class CharacterStateEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid", unique: true })
  character_id: string;

  @OneToOne(() => CharacterEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "character_id" })
  character: CharacterEntity;

  @Column({ type: "int", default: 0 })
  current_hp: number;

  @Column({ type: "int", default: 0 })
  temp_hp: number;

  @Column({ type: "int", default: 0 })
  max_hp_bonus: number;

  @Column({ type: "int", default: 0 })
  xp: number;

  @Column({ type: "int", default: 0 })
  cp: number;

  @Column({ type: "int", default: 0 })
  sp: number;

  @Column({ type: "int", default: 0 })
  gp: number;

  @Column({ type: "int", default: 0 })
  pp: number;

  @Column({ type: "int", default: 0 })
  death_saves_success: number;

  @Column({ type: "int", default: 0 })
  death_saves_fail: number;

  @Column({ type: "jsonb", default: [] })
  conditions: string[];

  @Column({ type: "jsonb", default: {} })
  spell_slots_used: Record<string, number>;

  @Column({ type: "jsonb", default: {} })
  hit_dice_used: Record<string, number>;

  @Column({ type: "int", default: 0 })
  ki_points_used: number;


  @Column({ type: "jsonb", default: {} })
  feature_uses_used: Record<string, number>;


  @Column({ type: "int", default: 0 })
  exhaustion_level: number;


  @Column({ type: "boolean", default: false })
  inspiration: boolean;




  @Column({ type: "jsonb", name: "pending_level_up", nullable: true })
  pending_level_up?: Record<string, unknown> | null;


  @Column({ type: "jsonb", name: "reaction_prefs", default: {} })
  reaction_prefs: Record<string, "auto" | "ask" | "off">;


  @Column({ type: "timestamptz", name: "last_long_rest_at", nullable: true })
  last_long_rest_at?: Date | null;


  @Column({ type: "timestamptz", name: "last_short_rest_at", nullable: true })
  last_short_rest_at?: Date | null;
}
