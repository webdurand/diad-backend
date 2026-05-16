import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import type {
  ColdOpenEmotionalArc,
  ColdOpenVoiceProfile,
} from "src/models/cold-open/domain/opening-archetype.types";

@Entity("opening_archetypes")
@Unique(["key"])
export class OpeningArchetypeEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 64 })
  key: string;

  @Column({ name: "display_name", type: "varchar", length: 120 })
  displayName: string;

  @Column({ name: "prompt_shape", type: "text" })
  promptShape: string;

  @Column({ name: "required_slots", type: "jsonb", default: [] })
  requiredSlots: string[];

  @Column({ name: "optional_slots", type: "jsonb", default: [] })
  optionalSlots: string[];

  @Column({ name: "banned_phrases", type: "jsonb", default: [] })
  bannedPhrases: string[];

  @Column({ name: "required_voice_profiles", type: "jsonb", default: [] })
  requiredVoiceProfiles: ColdOpenVoiceProfile[];

  @Column({ name: "compatible_pc_tags", type: "jsonb", default: [] })
  compatiblePcTags: string[];

  @Column({ name: "incompatible_pc_tags", type: "jsonb", default: [] })
  incompatiblePcTags: string[];

  @Column({ name: "emotional_arc", type: "varchar", length: 32 })
  emotionalArc: ColdOpenEmotionalArc;

  @Column({ name: "weight_default", type: "float", default: 1 })
  weightDefault: number;

  @Column({ name: "few_shot_example", type: "text", nullable: true })
  fewShotExample?: string | null;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "varchar", length: 3, default: "037" })
  since: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
