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
import type {
  BookendArtifactMetadata,
  BookendKind,
} from "src/models/bookends/domain/bookend.types";

@Entity("bookend_artifacts")
export class BookendArtifactEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "game_session_id", type: "uuid" })
  gameSessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "game_session_id" })
  gameSession: GameSessionEntity;

  @Index()
  @Column({ name: "phase_transition_id", type: "uuid", nullable: true })
  phaseTransitionId?: string | null;

  @ManyToOne(() => PhaseTransitionEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "phase_transition_id" })
  phaseTransition?: PhaseTransitionEntity | null;

  @Index()
  @Column({ type: "varchar", length: 32 })
  kind: BookendKind;

  @Column({ type: "text" })
  prose: string;

  @Column({
    name: "npcs_referenced",
    type: "uuid",
    array: true,
    default: () => "'{}'::uuid[]",
  })
  npcsReferenced: string[];

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  metadata: BookendArtifactMetadata;

  @Column({ name: "skipped_by_user", type: "boolean", default: false })
  skippedByUser: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
