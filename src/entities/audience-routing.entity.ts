import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

/**
 * Spec 017 — Matriz default global (eventCategory, eventType) → defaultAudiences[].
 *
 * Seed inicial vem de contracts/audience-routing.json (migration). Campanhas
 * ajustam via campaign_audience_overrides — entries com `overrideable=false`
 * não permitem remoção (preserva Princípio X).
 */
@Entity("audience_routing")
@Unique("audience_routing_unique", ["eventCategory", "eventType"])
export class AudienceRoutingEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "event_category", type: "varchar", length: 20 })
  eventCategory: "EncounterEvent" | "WorldEvent" | "NarrativeEvent" | "SocialEvent";

  @Column({ name: "event_type", type: "varchar", length: 64 })
  eventType: string;

  @Column({
    name: "default_audiences",
    type: "text",
    array: true,
    default: () => "'{}'::text[]",
  })
  defaultAudiences: string[];

  @Column({ name: "overrideable", type: "boolean", default: true })
  overrideable: boolean;

  @Column({ name: "sub_channel", type: "varchar", length: 64, nullable: true })
  subChannel?: string | null;

  @Column({ name: "rationale", type: "text", nullable: true })
  rationale?: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
