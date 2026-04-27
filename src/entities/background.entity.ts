import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { CompSourceEntity } from "./comp-source.entity";
import { FeatEntity } from "./feat.entity";
import { BackgroundProficiencyEntity } from "./background-proficiency.entity";

@Entity("backgrounds")
export class BackgroundEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: "jsonb", nullable: true })
  ability_scores?: Record<string, unknown>[];

  @Column({ type: "jsonb" })
  equipment_options: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  proficiency_choices?: Record<string, unknown>;

  @Column({ type: "uuid", nullable: true })
  feat_id?: string;

  @ManyToOne(() => FeatEntity, { nullable: true })
  @JoinColumn({ name: "feat_id" })
  feat?: FeatEntity;

  @Column({ type: "jsonb", nullable: true })
  language_choices?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  feature?: Record<string, unknown>;

  @Column({ type: "uuid", nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: "source_id" })
  source?: CompSourceEntity;

  @Column({ type: "jsonb", nullable: true })
  raw?: Record<string, unknown>;

  @OneToMany(() => BackgroundProficiencyEntity, (item) => item.background)
  background_proficiencies?: BackgroundProficiencyEntity[];

  @Column({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
