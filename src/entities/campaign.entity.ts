import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserEntity } from "./user.entity";

export interface CampaignContentBudget {
  maxScenes: number;
  maxNpcs: number;
  maxLocations: number;
  storyLength?: "short" | "standard" | "epic";
  targetScenes?: number;
  minScenes?: number;
}

export interface CampaignContentCounts {
  scenes: number;
  npcs: number;
  locations: number;
}

export interface CampaignDmPersonality {
  tone?: "epico" | "sombrio" | "comico" | "investigativo" | "pulp";
  verbosity?: "conciso" | "equilibrado" | "descritivo";
  forbiddenTropes?: string[];
  pacing?: "rapido" | "medio" | "lento";
  languageStyle?: "moderno" | "arcaico" | "coloquial";
}

export interface CampaignTonalAnchor {
  genre?: "horror" | "heist" | "political" | "dungeon" | "mystery" | "quest";
  toneTags?: string[];
  forbiddenTones?: string[];
  narratorVoice?: string;
}

export type ArcBeat =
  | "YOU"
  | "NEED"
  | "GO"
  | "SEARCH"
  | "FIND"
  | "TAKE"
  | "RETURN"
  | "CHANGE";

export interface CampaignArcState {
  currentBeat: ArcBeat;
  beatEnteredAtScene: number;
  transitionHistory: Array<{
    from: ArcBeat;
    to: ArcBeat;
    atScene: number;
    reason: string;
  }>;
}

export type NpcRosterPolicy = "legacy" | "canonical_v1";

@Entity("campaigns")
export class CampaignEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", unique: true })
  slug: string;

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "varchar", nullable: true })
  setting?: string;

  @Column({ type: "varchar", nullable: true })
  theme?: string;

  @Column({ type: "varchar", default: "standard" })
  difficulty: string;

  @Index()
  @Column({ name: "dm_user_id", type: "uuid" })
  dmUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "dm_user_id" })
  dm: UserEntity;

  @Column({ type: "varchar", default: "draft" })
  status: "draft" | "active" | "paused" | "completed" | "archived";


  @Column({ name: "dm_mode", type: "varchar", default: "ai" })
  dmMode: "ai" | "human";

  @Column({ type: "varchar", default: "solo" })
  scope: "solo" | "party";


  @Column({ name: "is_draft", type: "boolean", default: false })
  isDraft: boolean;

  @Column({ name: "is_sandbox", type: "boolean", default: false })
  isSandbox: boolean;


  @Column({ name: "generation_seed", type: "jsonb", nullable: true })
  generationSeed?: Record<string, unknown>;

  @Column({ name: "world_lore", type: "text", nullable: true })
  worldLore?: string;

  @Column({ name: "rules_variant", type: "jsonb", default: {} })
  rulesVariant: Record<string, any>;

  @Column({
    name: "invite_code",
    type: "varchar",
    nullable: true,
    unique: true,
  })
  inviteCode?: string;



  @Column({
    name: "content_budget",
    type: "jsonb",
    default: { maxScenes: 12, maxNpcs: 7, maxLocations: 6 },
  })
  contentBudget: CampaignContentBudget;

  @Column({
    name: "current_counts",
    type: "jsonb",
    default: { scenes: 0, npcs: 0, locations: 0 },
  })
  currentCounts: CampaignContentCounts;

  @Column({ name: "starting_location_id", type: "uuid", nullable: true })
  startingLocationId?: string | null;

  @Column({ name: "npc_roster_policy", type: "varchar", default: "legacy" })
  npcRosterPolicy: NpcRosterPolicy;

  @Column({ name: "npc_expansion_budget_total", type: "smallint", default: 10 })
  npcExpansionBudgetTotal: number;

  @Column({ name: "npc_expansion_budget_used", type: "smallint", default: 0 })
  npcExpansionBudgetUsed: number;

  @Column({ name: "dm_personality", type: "jsonb", default: {} })
  dmPersonality: CampaignDmPersonality;

  @Column({ name: "tonal_anchor", type: "jsonb", default: {} })
  tonalAnchor: CampaignTonalAnchor;

  @Column({ name: "central_question", type: "text", nullable: true })
  centralQuestion?: string;

  @Column({ name: "question_stated_at_scene", type: "int", nullable: true })
  questionStatedAtScene?: number;

  @Column({ name: "question_answered", type: "boolean", default: false })
  questionAnswered: boolean;

  @Column({ name: "question_answer", type: "text", nullable: true })
  questionAnswer?: string;

  @Column({
    name: "arc_state",
    type: "jsonb",
    default: {
      currentBeat: "YOU",
      beatEnteredAtScene: 1,
      transitionHistory: [],
    },
  })
  arcState: CampaignArcState;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
