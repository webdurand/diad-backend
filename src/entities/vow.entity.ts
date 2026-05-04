import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { GameSessionEntity } from "./game-session.entity";

export type VowRank =
  | "troublesome"
  | "dangerous"
  | "formidable"
  | "extreme"
  | "epic";

export type VowStatus = "open" | "fulfilled" | "forsaken";

export type CloseRollOutcome = "strong_hit" | "weak_hit" | "miss";

export interface VowMilestoneCondition {
  description: string;
  triggered: boolean;
  triggeredAtScene?: number;
  associatedEntity?: { type: string; id: string };
}

export interface VowCloseRollResult {
  targetNumber: number;
  challengeDice: [number, number];
  outcome: CloseRollOutcome;
  narrativeSeed: string;
  rolledAt: string;
}

@Entity("vows")
export class VowEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "game_session_id", type: "uuid" })
  gameSessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "game_session_id" })
  gameSession: GameSessionEntity;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "varchar" })
  rank: VowRank;

  @Column({ type: "numeric", precision: 4, scale: 2, default: 0 })
  progress: number;

  @Column({ type: "varchar", default: "open" })
  status: VowStatus;

  @Index()
  @Column({ name: "is_main_vow", type: "boolean", default: false })
  isMainVow: boolean;

  @Column({ name: "milestone_conditions", type: "jsonb", default: [] })
  milestoneConditions: VowMilestoneCondition[];

  @Column({ name: "close_roll_result", type: "jsonb", nullable: true })
  closeRollResult?: VowCloseRollResult;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "fulfilled_at", type: "timestamptz", nullable: true })
  fulfilledAt?: Date;
}
