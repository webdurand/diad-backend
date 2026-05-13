import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";
import { CharacterEntity } from "./character.entity";
import { GameSessionEntity } from "./game-session.entity";


export type RestKind = "short" | "long";
export type RestEventTriggered =
  | "npc_dialog_pending"
  | "dream_foreshadow"
  | "chekhov_payoff_reminder"
  | "mythic_random_event"
  | "hostile_interruption"
  | "npc_visit_opportunity"
  | "nothing";

@Entity("rest_sessions")
export class RestSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Column({ name: "session_id", type: "uuid", nullable: true })
  sessionId?: string;

  @ManyToOne(() => GameSessionEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "session_id" })
  session?: GameSessionEntity;

  @Index()
  @Column({ name: "character_id", type: "uuid" })
  characterId: string;

  @ManyToOne(() => CharacterEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "character_id" })
  character: CharacterEntity;

  @Column({ name: "scene_id_before", type: "uuid", nullable: true })
  sceneIdBefore?: string;

  @Column({ name: "scene_id_after", type: "uuid", nullable: true })
  sceneIdAfter?: string;

  @Column({ type: "varchar", length: 10 })
  kind: RestKind;

  @CreateDateColumn({ name: "started_at", type: "timestamptz" })
  startedAt: Date;

  @Column({ name: "ended_at", type: "timestamptz", nullable: true })
  endedAt?: Date;

  @Column({ name: "was_interrupted", type: "boolean", default: false })
  wasInterrupted: boolean;

  @Column({
    name: "interruption_reason",
    type: "varchar",
    length: 40,
    nullable: true,
  })
  interruptionReason?: string;

  @Column({
    name: "event_triggered",
    type: "varchar",
    length: 40,
    nullable: true,
  })
  eventTriggered?: RestEventTriggered;

  @Column({ name: "hp_recovered", type: "int", default: 0 })
  hpRecovered: number;

  @Column({ name: "hd_spent", type: "jsonb", default: {} })
  hdSpent: Record<string, number>;

  @Column({ name: "hd_recovered", type: "jsonb", default: {} })
  hdRecovered: Record<string, number>;

  @Column({ name: "slots_recovered", type: "jsonb", default: {} })
  slotsRecovered: Record<string, number>;

  @Column({ name: "exhaustion_delta", type: "int", default: 0 })
  exhaustionDelta: number;

  @Column({
    name: "features_restored",
    type: "text",
    array: true,
    default: () => "ARRAY[]::TEXT[]",
  })
  featuresRestored: string[];
}
