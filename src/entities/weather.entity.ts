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

export type WeatherTemperature = "frigid" | "cold" | "mild" | "hot" | "extreme";

export type WeatherWindStrength = "calm" | "breeze" | "strong" | "gale";

export type WeatherMagicalAnomaly =
  | "dead_magic"
  | "wild_magic"
  | "antimagic_field"
  | "weave_unstable";

export interface WeatherAffectsChecks {

  perception?: number;

  stealth?: number;

  ranged?: "normal" | "disadvantage";

  speedMultiplier?: number;
}


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
