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

  @Column({ name: "current_phase", type: "varchar", default: "hook" })
  currentPhase: "hook" | "development" | "climax" | "resolution";

  @Column({ name: "phase_notes", type: "jsonb", default: {} })
  phaseNotes: Record<string, string>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
