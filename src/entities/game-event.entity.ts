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
// (session_id, sequence) é o invariante que o pg_advisory_xact_lock do
// EventService.emit protege; como UNIQUE o banco também passa a cobrá-lo. O mesmo
// índice atende o MAX(sequence) da alocação de forma index-only, então nenhum
// índice extra sobre essas colunas é justificável — cada um custa em todo INSERT.
@Index("UQ_game_events_session_sequence", ["sessionId", "sequence"], {
  unique: true,
})
// Timeline do encontro (GET /encounters/:id/events) filtra por encounter_id e
// ordena por sequence; cobre também as buscas só por encounter_id (prefixo).
@Index("IDX_ge_encounter_seq", ["encounterId", "sequence"])
export class GameEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "session_id", type: "uuid" })
  sessionId: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session: GameSessionEntity;

  @Column({ name: "encounter_id", type: "uuid", nullable: true })
  encounterId?: string;

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
