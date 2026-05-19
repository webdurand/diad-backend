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
import { LocationPoiEntity } from "./location-poi.entity";

export type SessionNpcPosture =
  | "peaceful"
  | "uneasy"
  | "drawing_weapon"
  | "combat";

@Entity("session_npc_state")
@Unique(["gameSessionId", "npcId"])
@Index(["gameSessionId", "posture"])
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

  @Column({ type: "varchar", default: "peaceful" })
  posture: SessionNpcPosture;

  @Column({ name: "current_location_id", type: "uuid", nullable: true })
  currentLocationId?: string;

  @ManyToOne(() => LocationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "current_location_id" })
  currentLocation?: LocationEntity;

  @Column({ name: "current_poi_id", type: "uuid", nullable: true })
  currentPoiId?: string;

  @ManyToOne(() => LocationPoiEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "current_poi_id" })
  currentPoi?: LocationPoiEntity;


  @Column({
    name: "wealth_tier",
    type: "varchar",
    length: 16,
    default: "modest",
  })
  wealthTier: "destitute" | "poor" | "modest" | "wealthy" | "noble";


  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  treasure: Array<{
    itemId: string;
    name: string;
    quantity: number;
    value_gp?: number;
  }>;


  @Column({
    type: "jsonb",
    default: () => '\'{"cp":0,"sp":0,"gp":0,"pp":0}\'::jsonb',
  })
  currency: { cp: number; sp: number; gp: number; pp: number };

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
