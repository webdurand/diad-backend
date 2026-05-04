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
import { FactionEntity } from "./faction.entity";

@Entity("session_faction_state")
@Unique(["gameSessionId", "factionId"])
export class SessionFactionStateEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "game_session_id", type: "uuid" })
  gameSessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "game_session_id" })
  gameSession: GameSessionEntity;

  @Index()
  @Column({ name: "faction_id", type: "uuid" })
  factionId: string;

  @ManyToOne(() => FactionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "faction_id" })
  faction: FactionEntity;

  @Column({ name: "is_known_to_party", type: "boolean", default: false })
  isKnownToParty: boolean;

  @Column({ type: "varchar", default: "neutral" })
  disposition: "friendly" | "neutral" | "hostile" | "indifferent";

  @Column({ type: "int", default: 0 })
  reputation: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
