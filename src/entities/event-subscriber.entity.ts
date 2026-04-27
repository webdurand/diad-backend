import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

/**
 * Spec 017 — Registry de subscribers dinâmicos.
 *
 * Listeners default (Narrator/CombatAgent/Director/CompanionAI/HUD) ficam
 * registrados em código. Listeners adicionais (ex: companions específicos
 * em spec 022) são persistidos aqui — `EventBusService.subscribe` consulta
 * pra wire em runtime.
 */
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
