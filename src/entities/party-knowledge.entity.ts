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
import { GameSessionEntity } from "./game-session.entity";

@Entity("party_knowledge")
@Unique(["campaignId", "entityType", "entityId", "knowledgeKey"])
export class PartyKnowledgeEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Column({ name: "entity_type", type: "varchar" })
  entityType: string; // npc, location, faction, quest, item, lore

  @Column({ name: "entity_id", type: "uuid" })
  entityId: string;

  @Column({ name: "knowledge_key", type: "varchar" })
  knowledgeKey: string; // exists, name, secret_identity, weakness, etc.

  @Column({ name: "knowledge_value", type: "text", nullable: true })
  knowledgeValue?: string;

  @Column({ name: "discovered_in_session_id", type: "uuid", nullable: true })
  discoveredInSessionId?: string;

  @ManyToOne(() => GameSessionEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "discovered_in_session_id" })
  discoveredInSession?: GameSessionEntity;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt: Date;
}
