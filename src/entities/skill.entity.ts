import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { CompSourceEntity } from "./comp-source.entity";
import { AbilityScoreEntity } from "./ability-score.entity";

@Entity("skills")
export class SkillEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "uuid", nullable: true })
  ability_score_id?: string;

  @ManyToOne(() => AbilityScoreEntity, { nullable: true })
  @JoinColumn({ name: "ability_score_id" })
  ability_score?: AbilityScoreEntity;

  @Column({ type: "uuid", nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: "source_id" })
  source?: CompSourceEntity;

  @Column({ type: "jsonb", nullable: true })
  raw?: Record<string, unknown>;

  @Column({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
