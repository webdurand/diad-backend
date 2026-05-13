import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { CharacterEntity } from "./character.entity";


export type XpAwardSource =
  | "combat_kill"
  | "combat_resolved_peacefully"
  | "skill_challenge"
  | "quest_step"
  | "quest_completion"
  | "exploration_milestone"
  | "roleplay";

@Entity("xp_award_events")
export class XpAwardEventEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "character_id", type: "uuid" })
  characterId: string;

  @ManyToOne(() => CharacterEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "character_id" })
  character: CharacterEntity;

  @Column({ type: "int" })
  amount: number;

  @Column({ type: "varchar", length: 40 })
  source: XpAwardSource;

  @Column({ type: "varchar", length: 200 })
  reason: string;

  @Column({ name: "encounter_id", type: "uuid", nullable: true })
  encounterId?: string;

  @Column({ name: "quest_step_id", type: "uuid", nullable: true })
  questStepId?: string;

  @Column({ name: "narrative_justification", type: "text", nullable: true })
  narrativeJustification?: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
