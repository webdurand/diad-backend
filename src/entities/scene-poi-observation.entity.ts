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
import { LocationPoiEntity } from "./location-poi.entity";
import { SceneEntity } from "./scene.entity";

export type ScenePoiObservationFreshness = "fresh" | "stale" | "expired";

@Entity("scene_poi_observations")
@Unique(["sessionId", "poiId"])
export class ScenePoiObservationEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "session_id", type: "uuid" })
  sessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session: GameSessionEntity;

  @Index()
  @Column({ name: "poi_id", type: "uuid" })
  poiId: string;

  @ManyToOne(() => LocationPoiEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "poi_id" })
  poi: LocationPoiEntity;

  @Column({ name: "last_scene_id", type: "uuid", nullable: true })
  lastSceneId?: string | null;

  @ManyToOne(() => SceneEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "last_scene_id" })
  lastScene?: SceneEntity | null;

  @Column({ name: "observation_text", type: "text" })
  observationText: string;

  @Column({ name: "generated_at_turn", type: "int" })
  generatedAtTurn: number;

  @Column({ name: "expires_at_turn", type: "int" })
  expiresAtTurn: number;

  @Column({ type: "varchar", length: 16, default: "fresh" })
  freshness: ScenePoiObservationFreshness;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
