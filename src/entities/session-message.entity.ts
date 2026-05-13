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
import { UserEntity } from "./user.entity";

export type SessionMessageKind =
  | "narration"
  | "player_action"
  | "system"
  | "recap"
  | "xp"
  | "rest_done"
  | "morning_briefing"
  | "combat_resolution"
  | "dice_roll"
  | "choices"
  | "rewards"
  | "turn_outcome";


@Entity("session_messages")
@Index(["sessionId", "sequenceNumber"], { unique: true })
@Index(["sessionId", "clientId"], {
  unique: true,
  where: "client_id IS NOT NULL",
})
export class SessionMessageEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "session_id", type: "uuid" })
  sessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session: GameSessionEntity;

  @Index()
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "character_id", type: "uuid", nullable: true })
  characterId?: string;

  @Column({ type: "varchar" })
  kind: SessionMessageKind;


  @Column({ type: "text" })
  content: string;

  @Column({ name: "sequence_number", type: "int" })
  sequenceNumber: number;

  @Column({ name: "client_id", type: "varchar", nullable: true })
  clientId?: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
