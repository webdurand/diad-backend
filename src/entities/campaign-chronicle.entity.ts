import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";
import { GameSessionEntity } from "./game-session.entity";

@Entity("campaign_chronicles")
export class CampaignChronicleEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Column({ name: "session_id", type: "uuid", nullable: true })
  sessionId?: string;

  @ManyToOne(() => GameSessionEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "session_id" })
  session?: GameSessionEntity;

  @Column({ name: "entry_date", type: "varchar", nullable: true })
  entryDate?: string;

  @Column({ type: "varchar" })
  title: string;

  @Column({ type: "text" })
  content: string;

  @Column({ name: "entity_changes", type: "jsonb", default: {} })
  entityChanges: Record<string, any>;

  @Column({ type: "int", default: 5 })
  significance: number;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt: Date;
}
