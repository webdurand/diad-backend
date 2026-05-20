import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { CharacterEntity } from "./character.entity";
import { GameSessionEntity } from "./game-session.entity";
import { SceneEntity } from "./scene.entity";

export type MetaQueryIntentCategory =
  | "tactical_query"
  | "perception_query"
  | "rule_query"
  | "meta_world_query";

@Entity("meta_query_audit")
@Index("idx_meta_query_audit_session_scene", ["sessionId", "sceneId"])
@Index("idx_meta_query_audit_character_scene", ["characterId", "sceneId"])
export class MetaQueryAuditEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "session_id", type: "uuid" })
  sessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session: GameSessionEntity;

  @Column({ name: "scene_id", type: "uuid" })
  sceneId: string;

  @ManyToOne(() => SceneEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "scene_id" })
  scene: SceneEntity;

  @Column({ name: "character_id", type: "uuid", nullable: true })
  characterId?: string | null;

  @ManyToOne(() => CharacterEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "character_id" })
  character?: CharacterEntity | null;

  @Column({ name: "question_hash", type: "char", length: 64 })
  questionHash: string;

  @Column({ name: "intent_category", type: "varchar", length: 32 })
  intentCategory: MetaQueryIntentCategory;

  @Column({ name: "filtered_facts_count", type: "int", default: 0 })
  filteredFactsCount: number;

  @Column({ name: "trace_id", type: "varchar", length: 32, nullable: true })
  traceId?: string | null;

  @Column({ name: "answer_summary", type: "text" })
  answerSummary: string;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
