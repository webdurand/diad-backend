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

export type ClockType = "main" | "threat" | "opportunity";
export type ClockStatus = "active" | "filled" | "resolved" | "expired";

export interface ClockOnFullAction {
  trigger: "climax_phase" | "complication" | "opportunity_window" | "reveal";
  narrativeSeed: string;
  associatedEntityId?: string;
}

export interface ClockAdvanceRules {
  onSceneOutcome?: { success?: number; failure?: number };
  onPlayerChoice?: { risk_taken?: number; safe?: number };
  devilsBargain?: boolean;
}

@Entity("clocks")
export class ClockEntity {
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

  @Column({ type: "int" })
  segments: number;

  @Column({ type: "int", default: 0 })
  filled: number;

  @Column({ type: "varchar", default: "active" })
  status: ClockStatus;

  @Column({ type: "varchar", default: "threat" })
  type: ClockType;

  @Column({ name: "visible_to_player", type: "boolean", default: true })
  visibleToPlayer: boolean;

  @Column({ name: "on_full_action", type: "jsonb", default: {} })
  onFullAction: ClockOnFullAction;

  @Column({ name: "advance_rules", type: "jsonb", default: {} })
  advanceRules: ClockAdvanceRules;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @Column({ name: "expires_at", type: "timestamptz", nullable: true })
  expiresAt?: Date;
}
