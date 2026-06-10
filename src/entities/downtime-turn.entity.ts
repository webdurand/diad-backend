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
import { PhaseTransitionEntity } from "./phase-transition.entity";
import type { DowntimeArchetype } from "src/models/narrative-memory/domain/narrative-memory.types";

@Entity("downtime_turns")
@Index(["phaseTransitionId", "turnIndex"], { unique: true })
export class DowntimeTurnEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "game_session_id", type: "uuid" })
  gameSessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "game_session_id" })
  gameSession: GameSessionEntity;

  @Index()
  @Column({ name: "phase_transition_id", type: "uuid" })
  phaseTransitionId: string;

  @ManyToOne(() => PhaseTransitionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "phase_transition_id" })
  phaseTransition: PhaseTransitionEntity;

  @Column({ name: "turn_index", type: "smallint" })
  turnIndex: number;

  @Column({ name: "archetype_chosen", type: "varchar", length: 24 })
  archetypeChosen: DowntimeArchetype;

  @Column({ name: "chaos_factor", type: "smallint" })
  chaosFactor: number;

  @Column({ name: "narrative_text", type: "text" })
  narrativeText: string;

  @Column({ type: "varchar", length: 16, default: "ready" })
  status: "ready" | "failed";

  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
