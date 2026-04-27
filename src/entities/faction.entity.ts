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

@Entity("factions")
@Unique(["campaignId", "slug"])
export class FactionEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "varchar" })
  slug: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "jsonb", default: [] })
  goals: string[];

  @Column({ type: "varchar", nullable: true })
  alignment?: string;

  @Column({ name: "influence_level", type: "int", default: 5 })
  influenceLevel: number; // 1-10

  @Column({ name: "is_known_to_party", type: "boolean", default: false })
  isKnownToParty: boolean;

  @Column({ name: "headquarters_location_id", type: "uuid", nullable: true })
  headquartersLocationId?: string;

  @ManyToOne(() => LocationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "headquarters_location_id" })
  headquartersLocation?: LocationEntity;

  @Column({ type: "jsonb", default: [] })
  tags: string[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
