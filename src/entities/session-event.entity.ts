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
}
