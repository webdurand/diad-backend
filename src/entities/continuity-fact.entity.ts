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
import { GameSessionEntity } from "./game-session.entity";
import { SceneEntity } from "./scene.entity";

export type ContinuityFactType =
  | "npc_death"
  | "npc_status"
  | "promise_made"
  | "item_acquired"
  | "item_given"
  | "secret_learned"
  | "quest_update"
  | "combat_result"
  | "relationship_change"
  | "location_discovered"
  | "faction_change"
  | "clue_found"
  | "open_thread";

export type ContinuityFactEntityType =
  | "npc"
  | "location"
  | "quest"
  | "faction"
  | "party"
  | "item";

export type ContinuityFactStatus = "active" | "superseded" | "retracted";

@Entity("continuity_facts")
@Index(["sessionId", "status", "createdAt"])
@Index(["sessionId", "entityId", "status"])
@Index(["sessionId", "factType", "status"])
export class ContinuityFactEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "session_id", type: "uuid" })
  sessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session: GameSessionEntity;

  @Column({ name: "scene_id", type: "uuid", nullable: true })
  sceneId?: string;

  @ManyToOne(() => SceneEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "scene_id" })
  scene?: SceneEntity;

  @Column({ name: "fact_type", type: "varchar" })
  factType: ContinuityFactType;

  @Column({ name: "entity_type", type: "varchar", nullable: true })
  entityType?: ContinuityFactEntityType;

  @Column({ name: "entity_id", type: "uuid", nullable: true })
  entityId?: string;

  @Column({ name: "entity_name", type: "varchar", nullable: true })
  entityName?: string;

  @Column({ type: "text" })
  summary: string;

  @Column({ type: "varchar", default: "active" })
  status: ContinuityFactStatus;

  @Column({ type: "real", default: 1 })
  confidence: number;

  @Column({ type: "smallint", default: 5 })
  salience: number;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  tags: string[];

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @Column({ name: "source_turn", type: "int", nullable: true })
  sourceTurn?: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
