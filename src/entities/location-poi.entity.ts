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
import { LocationEntity } from "./location.entity";

@Entity("location_pois")
@Unique(["locationId", "slug"])
export class LocationPoiEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Index()
  @Column({ name: "location_id", type: "uuid" })
  locationId: string;

  @ManyToOne(() => LocationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "location_id" })
  location: LocationEntity;

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "varchar" })
  slug: string;

  @Column({ type: "varchar", default: "area" })
  type: string;

  @Column({ type: "varchar", length: 24, default: "wild" })
  kind: "safe" | "wild" | "objective" | "social";

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "varchar", nullable: true })
  atmosphere?: string;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  aliases: string[];

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  tags: string[];

  @Column({ name: "is_default", type: "boolean", default: false })
  isDefault: boolean;

  @Column({ name: "is_secret", type: "boolean", default: false })
  isSecret: boolean;

  @Column({ name: "is_known_to_party", type: "boolean", default: true })
  isKnownToParty: boolean;

  @Column({ name: "is_locked", type: "boolean", default: false })
  isLocked: boolean;

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  @Column({ name: "phase_index", type: "smallint", nullable: true })
  phaseIndex?: number | null;

  @Column({ name: "narrative_role", type: "varchar", nullable: true })
  narrativeRole?: string | null;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  properties: Record<string, any>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
