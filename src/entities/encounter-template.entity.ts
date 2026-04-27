import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";
import { LocationEntity } from "./location.entity";
import { LootTableEntity } from "./loot-table.entity";

@Entity("encounter_templates")
export class EncounterTemplateEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Column({ name: "location_id", type: "uuid", nullable: true })
  locationId?: string;

  @ManyToOne(() => LocationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "location_id" })
  location?: LocationEntity;

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "varchar", default: "medium" })
  difficulty: string;

  // [{ monster_id: uuid, count: number, notes?: string }]
  @Column({ type: "jsonb", default: [] })
  monsters: Array<{ monster_id: string; count: number; notes?: string }>;

  // [{ npc_id: uuid, side: 'enemy'|'ally' }]
  @Column({ name: "npc_combatants", type: "jsonb", default: [] })
  npcCombatants: Array<{ npc_id: string; side: string }>;

  @Column({ type: "jsonb", default: {} })
  environment: Record<string, any>;

  @Column({ name: "trigger_conditions", type: "jsonb", default: {} })
  triggerConditions: Record<string, any>;

  @Column({ name: "is_triggered", type: "boolean", default: false })
  isTriggered: boolean;

  @Column({ name: "xp_reward", type: "int", nullable: true })
  xpReward?: number;

  @Column({ name: "loot_table_id", type: "uuid", nullable: true })
  lootTableId?: string;

  @ManyToOne(() => LootTableEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "loot_table_id" })
  lootTable?: LootTableEntity;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
