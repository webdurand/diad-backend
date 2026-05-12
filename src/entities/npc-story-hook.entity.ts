import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";
import { NpcEntity } from "./npc.entity";

export type NpcStoryHookType =
  | "quest_giver"
  | "clue_holder"
  | "item_holder"
  | "merchant"
  | "faction_agent"
  | "witness"
  | "antagonist"
  | "mentor"
  | "victim"
  | "secret_keeper";

export type NpcStoryHookRelatedEntityType =
  | "npc"
  | "quest"
  | "quest_objective"
  | "location"
  | "faction"
  | "lore_entry"
  | "item"
  | "loot_table";

@Entity("npc_story_hooks")
@Index(["campaignId", "npcId"])
@Index(["campaignId", "hookType"])
export class NpcStoryHookEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Index()
  @Column({ name: "npc_id", type: "uuid" })
  npcId: string;

  @ManyToOne(() => NpcEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "npc_id" })
  npc: NpcEntity;

  @Column({ name: "hook_type", type: "varchar", length: 32 })
  hookType: NpcStoryHookType;

  @Column({ type: "varchar", nullable: true })
  title?: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ name: "related_entity_type", type: "varchar", nullable: true })
  relatedEntityType?: NpcStoryHookRelatedEntityType;

  @Column({ name: "related_entity_id", type: "uuid", nullable: true })
  relatedEntityId?: string;

  @Column({ name: "related_entity_name", type: "varchar", nullable: true })
  relatedEntityName?: string;

  @Column({ name: "is_known_to_party", type: "boolean", default: false })
  isKnownToParty: boolean;

  @Column({ type: "smallint", default: 5 })
  priority: number;

  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
