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
import { PhaseEntity } from "./phase.entity";
import type { ChronicleTier } from "src/models/narrative-memory/domain/narrative-memory.types";

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

  @Column({ name: "phase_id", type: "uuid", nullable: true })
  phaseId?: string | null;

  @ManyToOne(() => PhaseEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "phase_id" })
  phase?: PhaseEntity | null;

  @Index()
  @Column({ name: "phase_index", type: "smallint", nullable: true })
  phaseIndex?: number | null;

  @Column({ name: "entry_date", type: "varchar", nullable: true })
  entryDate?: string;

  @Column({ type: "varchar" })
  title: string;

  @Column({ type: "text" })
  content: string;

  @Column({ name: "entity_changes", type: "jsonb", default: {} })
  entityChanges: Record<string, any>;

  @Index()
  @Column({ type: "varchar", length: 16, default: "active" })
  tier: ChronicleTier;

  @Column({ name: "legacy_tags", type: "jsonb", default: [] })
  legacyTags: string[];

  @Column({ name: "tier_locked", type: "boolean", default: false })
  tierLocked: boolean;

  @Column({ name: "tiered_at", type: "timestamptz", nullable: true })
  tieredAt?: Date | null;

  @Column({ name: "summarizer_metadata", type: "jsonb", nullable: true })
  summarizerMetadata?: Record<string, unknown> | null;

  @Column({ type: "int", default: 5 })
  significance: number;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt: Date;
}
