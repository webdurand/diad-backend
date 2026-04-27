import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { GameSessionEntity } from "./game-session.entity";
import { SceneEntity } from "./scene.entity";

@Entity("session_events")
export class SessionEventEntity {
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

  @Column({ name: "event_type", type: "varchar" })
  eventType: string;
  // narrative, combat, social, exploration, rest, level_up,
  // item_acquired, quest_update, npc_interaction, location_change,
  // player_decision, dice_roll

  @Index()
  @Column({ type: "int" })
  sequence: number;

  @Column({ type: "text" })
  summary: string;

  @Column({ type: "jsonb", default: {} })
  details: Record<string, any>;

  @Column({ name: "actor_character_id", type: "uuid", nullable: true })
  actorCharacterId?: string;

  @Column({ name: "actor_npc_id", type: "uuid", nullable: true })
  actorNpcId?: string;

  @Column({ name: "is_visible_to_players", type: "boolean", default: true })
  isVisibleToPlayers: boolean;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt: Date;

  // ========== Spec 017 — Event Bus Foundation ==========
  // Colunas adicionadas pela migration 1782000000000-CreateEventBusFoundation.
  // Convivem com o caminho legado (eventType / details / summary) por 1 sprint.

  @Column({
    name: "event_category",
    type: "varchar",
    length: 20,
    nullable: true,
  })
  eventCategory?:
    | "EncounterEvent"
    | "WorldEvent"
    | "NarrativeEvent"
    | "SocialEvent"
    | null;

  @Column({ name: "event_payload", type: "jsonb", default: () => "'{}'::jsonb" })
  eventPayload: Record<string, unknown>;

  @Column({
    name: "audiences",
    type: "text",
    array: true,
    default: () => "'{}'::text[]",
  })
  audiences: string[];

  @Column({ name: "trace_id", type: "varchar", length: 32, nullable: true })
  traceId?: string | null;

  @Column({ name: "span_id", type: "varchar", length: 16, nullable: true })
  spanId?: string | null;

  @Column({
    name: "narrative_descriptor",
    type: "varchar",
    length: 120,
    nullable: true,
  })
  narrativeDescriptor?: string | null;

  @Column({ name: "metadata", type: "jsonb", default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @Column({ name: "version", type: "int", default: 1 })
  version: number;

  @Column({ name: "aggregate_id", type: "uuid", nullable: true })
  aggregateId?: string | null;
}
