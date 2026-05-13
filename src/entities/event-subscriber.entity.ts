import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";


@Entity("event_subscribers")
@Unique("event_subscribers_listener_name_unique", ["listenerName"])
export class EventSubscriberEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "listener_name", type: "varchar", length: 120 })
  listenerName: string;

  @Column({
    name: "categories",
    type: "text",
    array: true,
    default: () => "'{}'::text[]",
  })
  categories: string[];

  @Column({ name: "scope", type: "jsonb", default: () => "'{}'::jsonb" })
  scope: Record<string, unknown>;

  @CreateDateColumn({ name: "registered_at", type: "timestamptz" })
  registeredAt: Date;
}
