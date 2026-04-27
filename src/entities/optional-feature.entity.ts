import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { CompSourceEntity } from "./comp-source.entity";

@Entity("optional_features")
export class OptionalFeatureEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "varchar" })
  feature_type: string;

  @Column({ type: "int", nullable: true })
  min_level?: number;

  @Column({ type: "jsonb", nullable: true })
  prerequisite?: Record<string, unknown>;

  @Column({ type: "boolean", default: false })
  has_sub_choices: boolean;

  @Column({ type: "text", nullable: true })
  sub_choice_type?: string;

  @Column({ type: "jsonb", nullable: true })
  sub_choice_options?: Record<string, unknown>;

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
