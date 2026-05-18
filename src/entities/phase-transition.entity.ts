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
import { StoryArcEntity } from "./story-arc.entity";
import type {
  DiegeticRitualKey,
  OutcomeTier,
  TwoBeatAudit,
  XpTriggerState,
} from "src/models/story-hidden-layer/domain/hidden-layer.types";

@Entity("phase_transitions")
export class PhaseTransitionEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "game_session_id", type: "uuid" })
  gameSessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "game_session_id" })
  gameSession: GameSessionEntity;

  @Index()
  @Column({ name: "story_arc_id", type: "uuid" })
  storyArcId: string;

  @ManyToOne(() => StoryArcEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "story_arc_id" })
  storyArc: StoryArcEntity;

  @Column({ name: "from_phase_index", type: "smallint" })
  fromPhaseIndex: number;

  @Column({ name: "to_phase_index", type: "smallint" })
  toPhaseIndex: number;

  @Column({
    name: "transition_beat_narrative_seed",
    type: "text",
    nullable: true,
  })
  transitionBeatNarrativeSeed?: string | null;

  @Column({ name: "bookend_status", type: "varchar", length: 24, default: "pending" })
  bookendStatus: "pending" | "rendering" | "ready" | "failed";

  @Column({
    name: "bookend_payload_snapshot",
    type: "jsonb",
    nullable: true,
  })
  bookendPayloadSnapshot?: Record<string, unknown> | null;

  @Column({ name: "outcome_tier", type: "varchar", length: 24, nullable: true })
  outcomeTier?: OutcomeTier | null;

  @Column({
    name: "xp_trigger_state",
    type: "jsonb",
    nullable: true,
  })
  xpTriggerState?: XpTriggerState | null;

  @Column({
    name: "diegetic_ritual_resolved",
    type: "varchar",
    length: 32,
    nullable: true,
  })
  diegeticRitualResolved?: DiegeticRitualKey | null;

  @Column({
    name: "two_beat",
    type: "jsonb",
    nullable: true,
  })
  twoBeat?: TwoBeatAudit | null;

  @Column({ name: "confirmed_by_user_id", type: "uuid", nullable: true })
  confirmedByUserId?: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
