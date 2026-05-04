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
import { NpcEntity } from "./npc.entity";
import { LocationEntity } from "./location.entity";

@Entity("session_npc_state")
@Unique(["gameSessionId", "npcId"])
export class SessionNpcStateEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "game_session_id", type: "uuid" })
  gameSessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "game_session_id" })
  gameSession: GameSessionEntity;

  @Index()
  @Column({ name: "npc_id", type: "uuid" })
  npcId: string;

  @ManyToOne(() => NpcEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "npc_id" })
  npc: NpcEntity;

  @Column({ type: "varchar", default: "alive" })
  status: "alive" | "dead" | "missing" | "unknown";

  @Column({ type: "varchar", default: "neutral" })
  disposition: "friendly" | "neutral" | "hostile" | "indifferent";

  @Column({ name: "current_location_id", type: "uuid", nullable: true })
  currentLocationId?: string;

  @ManyToOne(() => LocationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "current_location_id" })
  currentLocation?: LocationEntity;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
