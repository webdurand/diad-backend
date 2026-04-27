import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";
import { UserEntity } from "./user.entity";
import { CharacterEntity } from "./character.entity";

@Entity("campaign_players")
@Unique(["campaignId", "userId"])
export class CampaignPlayerEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Index()
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "character_id", type: "uuid", nullable: true })
  characterId?: string;

  @ManyToOne(() => CharacterEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "character_id" })
  character?: CharacterEntity;

  @Column({ name: "joined_at", type: "timestamptz", default: () => "now()" })
  joinedAt: Date;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;
}
