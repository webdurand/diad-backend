import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";


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
