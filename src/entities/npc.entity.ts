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
import { MonsterEntity } from "./monster.entity";

@Entity("npcs")
@Unique(["campaignId", "slug"])
export class NpcEntity {
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

  @Column({ type: "varchar", nullable: true })
  title?: string;

  @Column({ type: "varchar", nullable: true })
  race?: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ name: "description_hidden", type: "text", nullable: true })
  descriptionHidden?: string;

  @Column({ type: "varchar", default: "alive" })
  status: "alive" | "dead" | "missing" | "unknown";

  @Column({ type: "varchar", default: "neutral" })
  disposition: "friendly" | "neutral" | "hostile" | "indifferent";

  @Index()
  @Column({ name: "current_location_id", type: "uuid", nullable: true })
  currentLocationId?: string;

  @ManyToOne(() => LocationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "current_location_id" })
  currentLocation?: LocationEntity;

  @Column({ name: "monster_id", type: "uuid", nullable: true })
  monsterId?: string;

  @ManyToOne(() => MonsterEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "monster_id" })
  monster?: MonsterEntity;

  // Big 5 personality traits (0.0-1.0 each) for future AI dialogue consistency
  @Column({ name: "personality_big5", type: "jsonb", default: {} })
  personalityBig5: {
    openness?: number;
    conscientiousness?: number;
    extraversion?: number;
    agreeableness?: number;
    neuroticism?: number;
  };

  @Column({ type: "text", nullable: true })
  motivation?: string;

  @Column({ name: "knowledge_scope", type: "jsonb", default: [] })
  knowledgeScope: string[];

  @Column({ name: "dialogue_style", type: "varchar", nullable: true })
  dialogueStyle?: string;

  @Column({ name: "voice_notes", type: "text", nullable: true })
  voiceNotes?: string;

  @Column({ type: "jsonb", default: [] })
  tags: string[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
