import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { GameSessionEntity } from "./game-session.entity";

@Entity("game_events")
export class GameEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "session_id", type: "uuid" })
  sessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session: GameSessionEntity;

  @Column({ name: "encounter_id", type: "uuid", nullable: true })
  encounterId?: string;

  @Index()
  @Column({ type: "int" })
  sequence: number;

  @Column({ name: "event_type", type: "varchar" })
  eventType: string;

  @Column({ name: "actor_participant_id", type: "uuid", nullable: true })
  actorParticipantId?: string;

  @Column({ name: "target_participant_id", type: "uuid", nullable: true })
  targetParticipantId?: string;

  @Column({ type: "jsonb" })
  data: Record<string, unknown>;

  @Column({
    name: "created_at",
    type: "timestamptz",
    default: () => "now()",
  })
  createdAt: Date;
}
