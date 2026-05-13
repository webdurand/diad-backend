import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";


@Entity("campaign_audience_overrides")
@Unique("campaign_audience_overrides_unique", [
  "campaignId",
  "eventCategory",
  "eventType",
])
export class CampaignAudienceOverrideEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Column({ name: "event_category", type: "varchar", length: 20 })
  eventCategory:
    | "EncounterEvent"
    | "WorldEvent"
    | "NarrativeEvent"
    | "SocialEvent";

  @Column({ name: "event_type", type: "varchar", length: 64 })
  eventType: string;

  @Column({
    name: "audiences",
    type: "text",
    array: true,
    default: () => "'{}'::text[]",
  })
  audiences: string[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
