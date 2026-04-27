import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { GameSessionEntity } from "./game-session.entity";
import { EncounterParticipantEntity } from "./encounter-participant.entity";

@Entity("encounters")
export class EncounterEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "session_id", type: "uuid" })
  sessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session: GameSessionEntity;

  @Column({ type: "varchar" })
  name: string;

  @Column({
    type: "varchar",
    default: "preparing",
  })
  status: "preparing" | "rolling_initiative" | "active" | "completed";

  @Column({ name: "current_round", type: "int", default: 1 })
  currentRound: number;

  @Column({ name: "current_turn_index", type: "int", default: 0 })
  currentTurnIndex: number;

  @Column({ name: "turn_order", type: "jsonb", default: [] })
  turnOrder: string[];

  /** Spec 004: encontro acontece no covil de criatura lendária? Habilita lair actions. */
  @Column({ name: "in_lair", type: "boolean", default: false })
  inLair: boolean;

  @Column({ type: "jsonb", nullable: true })
  difficulty?: {
    adjusted_xp: number;
    threshold: string;
    total_monster_xp: number;
    party_level_summary: Record<number, number>;
  };

  @Column({ name: "map_data", type: "jsonb", default: {} })
  mapData: {
    backgroundUrl?: string;
    gridSize?: number; // cells per row (default 20)
    gridColumns?: number; // columns (default = gridSize)
    gridRows?: number; // rows (default = gridSize)
    gridVisible?: boolean; // show grid lines (default true)
    gridColor?: string; // grid line color (default rgba(255,255,255,0.15))
    /** Spec 012 Lote B — RAW 2024: cells de difficult terrain dobram custo de movimento. */
    difficultTerrainCells?: Array<{ x: number; y: number }>;
  };

  @OneToMany(() => EncounterParticipantEntity, (p) => p.encounter)
  participants?: EncounterParticipantEntity[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
