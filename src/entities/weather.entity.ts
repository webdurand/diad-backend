import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";
import { SceneEntity } from "./scene.entity";

export type WeatherPrecipitation =
  | "clear"
  | "rain"
  | "storm"
  | "snow"
  | "fog"
  | "magical";

export type WeatherVisibility = "normal" | "dim" | "dark" | "obscured";

export type WeatherTemperature =
  | "frigid"
  | "cold"
  | "mild"
  | "hot"
  | "extreme";

export type WeatherWindStrength = "calm" | "breeze" | "strong" | "gale";

export type WeatherMagicalAnomaly =
  | "dead_magic"
  | "wild_magic"
  | "antimagic_field"
  | "weave_unstable";

export interface WeatherAffectsChecks {
  /** Delta numérico em passive perception (ex: -2 chuva forte). */
  perception?: number;
  /** Delta numérico em stealth checks (chuva ajuda stealth = +N). */
  stealth?: number;
  /** RAW DMG: gale wind ou heavy precipitation = disadvantage em ranged attacks. */
  ranged?: "normal" | "disadvantage";
  /** 1.0 = normal; 0.5 = terreno difícil (snow heavy). */
  speedMultiplier?: number;
}

/**
 * Spec 019 — Living World & Ambiance.
 *
 * Weather state per (campaign, scene?). sceneId NULL = default da campanha;
 * preenchido = override de cena específica. Constraint unique
 * (campaign_id, scene_id NULLS NOT DISTINCT) garante 1 row por par.
 *
 * Modifiers em `affectsChecks` são lidos pelo CombatAgent L1 RuleEngine
 * (Princípio II — declarativo, não hardcoded em prompt).
 */
@Entity("weather")
@Unique("uq_weather_campaign_scene", ["campaignId", "sceneId"])
export class WeatherEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Index()
  @Column({ name: "scene_id", type: "uuid", nullable: true })
  sceneId?: string | null;

  @ManyToOne(() => SceneEntity, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "scene_id" })
  scene?: SceneEntity | null;

  @Column({ type: "varchar", length: 16, default: "clear" })
  precipitation: WeatherPrecipitation;

  @Column({ type: "varchar", length: 16, default: "normal" })
  visibility: WeatherVisibility;

  @Column({ type: "varchar", length: 16, default: "mild" })
  temperature: WeatherTemperature;

  @Column({
    name: "wind_strength",
    type: "varchar",
    length: 16,
    default: "calm",
  })
  windStrength: WeatherWindStrength;

  @Column({
    name: "magical_anomaly",
    type: "varchar",
    length: 24,
    nullable: true,
  })
  magicalAnomaly?: WeatherMagicalAnomaly | null;

  @Column({ name: "affects_checks", type: "jsonb", default: {} })
  affectsChecks: WeatherAffectsChecks;

  @Column({
    name: "narrative_seed",
    type: "varchar",
    length: 280,
    nullable: true,
  })
  narrativeSeed?: string;

  @Column({ name: "rolled_at", type: "timestamptz", default: () => "now()" })
  rolledAt: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
