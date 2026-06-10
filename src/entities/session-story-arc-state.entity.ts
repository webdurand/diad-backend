import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { GameSessionEntity } from "./game-session.entity";
import { StoryArcEntity } from "./story-arc.entity";
import type { XpTriggerState } from "src/models/story-hidden-layer/domain/hidden-layer.types";

@Entity("session_story_arc_state")
@Unique(["gameSessionId", "storyArcId"])
export class SessionStoryArcStateEntity {
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

  // "completed"/"failed" são estados terminais da campanha (spec 052) — a
  // coluna é varchar, então não há migration; o union documenta o ciclo todo.
  @Column({ name: "current_phase", type: "varchar", default: "hook" })
  currentPhase:
    | "hook"
    | "development"
    | "climax"
    | "resolution"
    | "completed"
    | "failed";

  @Column({ name: "current_phase_index", type: "smallint", default: 1 })
  currentPhaseIndex: number;

  @Column({ name: "phase_notes", type: "jsonb", default: {} })
  phaseNotes: Record<string, string>;

  @Column({
    name: "xp_trigger_state",
    type: "jsonb",
    default: () =>
      `'{ "objective_met": false, "belief_expressed": false, "flaw_struggled": false, "bond_progressed": false, "secret_revealed": false }'::jsonb`,
  })
  xpTriggerState: XpTriggerState;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
