import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { CompSourceEntity } from "./comp-source.entity";
import { ClassEntity } from "./class.entity";
import { SubclassEntity } from "./subclass.entity";

@Entity("features")
export class FeatureEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: "int" })
  level: number;

  @Column({ type: "jsonb" })
  description: Record<string, unknown>;

  @Column({ type: "jsonb" })
  prerequisites: Record<string, unknown>;

  @Column({ type: "text", nullable: true })
  reference?: string;

  @Column({ type: "jsonb", nullable: true })
  feature_specific?: Record<string, unknown>;

  @Column({ type: "uuid", nullable: true })
  class_id?: string;

  @ManyToOne(() => ClassEntity, { nullable: true })
  @JoinColumn({ name: "class_id" })
  class?: ClassEntity;

  @Column({ type: "uuid", nullable: true })
  subclass_id?: string;

  @ManyToOne(() => SubclassEntity, { nullable: true })
  @JoinColumn({ name: "subclass_id" })
  subclass?: SubclassEntity;

  @Column({ type: "uuid", nullable: true })
  parent_id?: string;

  @ManyToOne(() => FeatureEntity, { nullable: true })
  @JoinColumn({ name: "parent_id" })
  parent?: FeatureEntity;

  @OneToMany(() => FeatureEntity, (feature) => feature.parent)
  children?: FeatureEntity[];

  @Column({ type: "uuid", nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: "source_id" })
  source?: CompSourceEntity;

  @Column({ type: "jsonb", nullable: true })
  raw?: Record<string, unknown>;

  @Column({ type: "varchar", length: 16, nullable: true })
  category?: "active" | "passive" | "capstone" | "resource";

  @Column({ type: "text", nullable: true })
  display_text?: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  narrative_descriptor?: string;

  @Column({ type: "smallint", nullable: true })
  tactical_value?: number;

  @Column({ type: "jsonb", nullable: true })
  resource_charges?: {
    current?: number;
    max: number | null;
    formula?: string;
  };

  @Column({ type: "varchar", length: 16, nullable: true })
  recharge_rule?: "short" | "long" | "turn" | "none";

  @Column({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
