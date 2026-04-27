import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

/**
 * Spec 017 — Idempotência de listeners (ADR-017 prática 4).
 *
 * Cada listener guarda 1 row por (listenerName, eventId) processado. Antes
 * de side-effect, listener checa esta tabela; se existir, skip. Crítico pra
 * replay determinístico em ES futuro — em EDA atual raramente importa, mas
 * o custo é trivial.
 */
@Entity("event_listener_processed")
@Unique("event_listener_processed_unique", ["listenerName", "eventId"])
export class EventListenerProcessedEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "listener_name", type: "varchar", length: 120 })
  listenerName: string;

  @Index()
  @Column({ name: "event_id", type: "uuid" })
  eventId: string;

  @CreateDateColumn({ name: "processed_at", type: "timestamptz" })
  processedAt: Date;
}
