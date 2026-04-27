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

  /**
   * Spec 003 — usos consumidos por class-feature slug.
   * Max vem do SRD derivado de classe+nível; remaining = max - used.
   * Reset em short/long rest conforme `feature.rechargeOn`.
   * Para pools (ex: `lay-on-hands`), armazena HP gasto contra pool máximo `5 × paladinLevel`.
   */
  @Column({ type: "jsonb", default: {} })
  feature_uses_used: Record<string, number>;

  /** Exhaustion level (0-10 for 2024 rules, 0-6 for 2014) */
  @Column({ type: "int", default: 0 })
  exhaustion_level: number;

  /** Whether the character has inspiration */
  @Column({ type: "boolean", default: false })
  inspiration: boolean;

  // ── Spec 016 — Play Shell Foundation ──

  /**
   * Snapshot do drawer level-up (idempotent — refresh preserva).
   * Disparado quando currentXP >= threshold[level+1]. Apply gated em
   * rest/end-encounter.
   */
  @Column({ type: "jsonb", name: "pending_level_up", nullable: true })
  pending_level_up?: Record<string, unknown> | null;

  /**
   * Reaction overrides per (reactionName -> 'auto'|'ask'|'off'). Defaults
   * por classe via `reaction_defaults`. Player override sempre vence.
   */
  @Column({ type: "jsonb", name: "reaction_prefs", default: {} })
  reaction_prefs: Record<string, "auto" | "ask" | "off">;

  /** Última vez que o PC completou long rest (24h gate RAW 2024). */
  @Column({ type: "timestamptz", name: "last_long_rest_at", nullable: true })
  last_long_rest_at?: Date | null;

  /** Última vez que o PC completou short rest (1h spend HD). */
  @Column({ type: "timestamptz", name: "last_short_rest_at", nullable: true })
  last_short_rest_at?: Date | null;
}
