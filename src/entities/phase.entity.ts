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
import { StoryArcEntity } from "./story-arc.entity";
import type { ClosingSeedSnapshot } from "src/models/story-hidden-layer/domain/hidden-layer.types";

export type PhaseEmotionalArc =
  | "rise"
  | "fall"
  | "cinderella"
  | "man-in-hole"
  | "icarus"
  | "oedipus"
  | "return"
  | "flat";

export type PhaseArcBeat =
  | "YOU"
  | "NEED"
  | "GO"
  | "SEARCH"
  | "FIND"
  | "TAKE"
  | "RETURN"
  | "CHANGE";

export interface PhaseConditionSet {
  any: Array<Record<string, unknown>>;
}

export interface PhaseDeprecatesOnAdvance {
  lostObjectives: string[];
  migratingNpcs: Array<{ npcId: string; newRole: string }>;
  deprecatedPois: string[];
}

export interface PhaseBondHistoryEntry {
  phaseTransitionId: string;
  bondResolved: string | null;
  bondEmerging: Record<string, unknown> | null;
  recordedAt: string;
}

@Entity("phases")
@Unique(["storyArcId", "index"])
export class PhaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "story_arc_id", type: "uuid" })
  storyArcId: string;

  @ManyToOne(() => StoryArcEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "story_arc_id" })
  storyArc: StoryArcEntity;

  @Column({ type: "smallint" })
  index: number;

  @Column({ type: "varchar", length: 60 })
  name: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  @Column({ name: "emotional_arc", type: "varchar", length: 32 })
  emotionalArc: PhaseEmotionalArc;

  @Column({ name: "arc_beats", type: "jsonb", default: () => "'[]'::jsonb" })
  arcBeats: PhaseArcBeat[];

  @Column({
    name: "unlock_conditions",
    type: "jsonb",
    default: () => `'{ "any": [] }'::jsonb`,
  })
  unlockConditions: PhaseConditionSet;

  @Column({
    name: "completion_conditions",
    type: "jsonb",
    default: () => `'{ "any": [] }'::jsonb`,
  })
  completionConditions: PhaseConditionSet;

  @Column({
    name: "transition_beat_narrative_seed",
    type: "text",
    nullable: true,
  })
  transitionBeatNarrativeSeed?: string | null;

  @Column({
    name: "deprecates_on_advance",
    type: "jsonb",
    default: () =>
      `'{ "lostObjectives": [], "migratingNpcs": [], "deprecatedPois": [] }'::jsonb`,
  })
  deprecatesOnAdvance: PhaseDeprecatesOnAdvance;

  @Column({
    name: "closing_seed",
    type: "jsonb",
    nullable: true,
  })
  closingSeed?: ClosingSeedSnapshot | null;

  @Column({ name: "bond_history", type: "jsonb", default: [] })
  bondHistory: PhaseBondHistoryEntry[];

  @Column({ name: "is_reversible", type: "boolean", default: false })
  isReversible: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
