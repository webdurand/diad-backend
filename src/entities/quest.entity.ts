import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";
import { StoryArcEntity } from "./story-arc.entity";
import { NpcEntity } from "./npc.entity";
import { LocationEntity } from "./location.entity";
import { QuestObjectiveEntity } from "./quest-objective.entity";

@Entity("quests")
@Unique(["campaignId", "slug"])
export class QuestEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Column({ name: "story_arc_id", type: "uuid", nullable: true })
  storyArcId?: string;

  @ManyToOne(() => StoryArcEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "story_arc_id" })
  storyArc?: StoryArcEntity;

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "varchar" })
  slug: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ name: "description_hidden", type: "text", nullable: true })
  descriptionHidden?: string;

  @Column({ type: "varchar", default: "unknown" })
  status:
    | "unknown"
    | "available"
    | "active"
    | "completed"
    | "failed"
    | "abandoned";

  @Column({ name: "giver_npc_id", type: "uuid", nullable: true })
  giverNpcId?: string;

  @ManyToOne(() => NpcEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "giver_npc_id" })
  giverNpc?: NpcEntity;

  @Column({ name: "location_id", type: "uuid", nullable: true })
  locationId?: string;

  @ManyToOne(() => LocationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "location_id" })
  location?: LocationEntity;

  @Column({ type: "jsonb", default: {} })
  rewards: {
    xp?: number;
    gold?: number;
    items?: string[];
    reputation?: Record<string, number>;
  };

  @Column({ name: "level_range", type: "jsonb", nullable: true })
  levelRange?: { min?: number; max?: number };

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  @Column({ name: "is_main_quest", type: "boolean", default: false })
  isMainQuest: boolean;

  @Column({ name: "trigger_npc_name", type: "varchar", nullable: true })
  triggerNpcName?: string;

  @Column({ name: "trigger_location_name", type: "varchar", nullable: true })
  triggerLocationName?: string;

  @Column({ name: "activation_keys", type: "jsonb", default: [] })
  activationKeys: string[];

  @Column({ name: "revealed_at", type: "timestamptz", nullable: true })
  revealedAt?: Date;

  @Column({ name: "discovered_at", type: "timestamptz", nullable: true })
  discoveredAt?: Date;

  @Column({ name: "reveal_evidence", type: "text", nullable: true })
  revealEvidence?: string;

  @OneToMany(() => QuestObjectiveEntity, (o) => o.quest)
  objectives?: QuestObjectiveEntity[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
