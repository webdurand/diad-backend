import { Column, Entity, PrimaryColumn } from "typeorm";
import type {
  DiegeticRitualKey,
  OutcomeTier,
} from "src/models/story-hidden-layer/domain/hidden-layer.types";
import type { PhaseEmotionalArc } from "./phase.entity";

@Entity("diegetic_rituals")
export class DiegeticRitualEntity {
  @PrimaryColumn({ type: "varchar", length: 32 })
  key: DiegeticRitualKey;

  @Column({ name: "display_name", type: "varchar", length: 60 })
  displayName: string;

  @Column({ name: "default_tone", type: "varchar", length: 32 })
  defaultTone: string;

  @Column({ name: "compatible_emotional_arcs", type: "jsonb" })
  compatibleEmotionalArcs: PhaseEmotionalArc[];

  @Column({ name: "compatible_outcome_tiers", type: "jsonb" })
  compatibleOutcomeTiers: OutcomeTier[];

  @Column({ name: "narrative_seed_template", type: "text" })
  narrativeSeedTemplate: string;

  @Column({
    name: "banned_phrases_contextual",
    type: "jsonb",
    default: () => "'[]'::jsonb",
  })
  bannedPhrasesContextual: string[];

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "varchar", length: 3, default: "039" })
  since: string;
}
