import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { CompSourceEntity } from "./comp-source.entity";
import type {
  MonsterMultiattack,
  MonsterSpellcasting,
} from "../models/game-engine/interfaces/monster-typed";
import type { LairAction } from "../models/game-engine/interfaces/combat.interfaces";

@Entity("monsters")
export class MonsterEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: "text" })
  size: string;

  @Column({ type: "text" })
  type: string;

  @Column({ type: "text", nullable: true })
  subtype?: string;

  @Column({ type: "text" })
  alignment: string;

  @Column({ type: "jsonb" })
  armor_class: Record<string, unknown>;

  @Column({ type: "int" })
  hit_points: number;

  @Column({ type: "text" })
  hit_dice: string;

  @Column({ type: "text" })
  hit_points_roll: string;

  @Column({ type: "jsonb" })
  speed: Record<string, unknown>;

  @Column({ type: "int" })
  strength: number;

  @Column({ type: "int" })
  dexterity: number;

  @Column({ type: "int" })
  constitution: number;

  @Column({ type: "int" })
  intelligence: number;

  @Column({ type: "int" })
  wisdom: number;

  @Column({ type: "int" })
  charisma: number;

  @Column({ type: "jsonb" })
  proficiencies: Record<string, unknown>;

  @Column({ type: "jsonb" })
  damage_vulnerabilities: Record<string, unknown>;

  @Column({ type: "jsonb" })
  damage_resistances: Record<string, unknown>;

  @Column({ type: "jsonb" })
  damage_immunities: Record<string, unknown>;

  @Column({ type: "jsonb" })
  condition_immunities: Record<string, unknown>;

  @Column({ type: "jsonb" })
  senses: Record<string, unknown>;

  @Column({ type: "text" })
  languages: string;

  @Column({ type: "int" })
  proficiency_bonus: number;

  @Column({ type: "int" })
  xp: number;

  @Column({ type: "jsonb", nullable: true })
  special_abilities?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  actions?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  legendary_actions?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  reactions?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  forms?: Record<string, unknown>;

  // Typed structures populated by data migrations from SRD free-text.
  @Column({ type: "jsonb", nullable: true })
  multiattack: MonsterMultiattack | null;

  @Column({ type: "jsonb", nullable: true })
  spellcasting: MonsterSpellcasting | null;

  // Spec 004: lair actions e mapa de custo de ações lendárias
  @Column({ name: "lair_actions", type: "jsonb", nullable: true })
  lair_actions: LairAction[] | null;

  @Column({ name: "legendary_action_cost_map", type: "jsonb", nullable: true })
  legendary_action_cost_map: Record<string, 1 | 2 | 3> | null;

  @Column({ type: "text", nullable: true })
  image?: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "double precision" })
  challenge_rating: number;

  @Column({ type: "uuid", nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: "source_id" })
  source?: CompSourceEntity;

  @Column({ type: "jsonb", nullable: true })
  raw?: Record<string, unknown>;

  @Column({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
