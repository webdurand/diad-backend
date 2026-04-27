import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { CompSourceEntity } from "./comp-source.entity";
import { EquipmentCategoryItemEntity } from "./equipment-category-item.entity";

@Entity("equipments")
export class EquipmentEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: "numeric", default: 0 })
  weight: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "text", nullable: true })
  image?: string;

  @Column({ type: "jsonb" })
  cost: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  damage?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  armor_class?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  properties?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  utilize?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  contents?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  craft?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  range?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  consumable_effect?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  mastery?: Record<string, unknown>;

  @Column({ type: "boolean", default: false })
  stealth_disadvantage: boolean;

  @Column({ type: "int", nullable: true })
  str_minimum?: number;

  @Column({ type: "text", nullable: true })
  weapon_category?: string;

  @Column({ type: "text", nullable: true })
  don_time?: string;

  @Column({ type: "text", nullable: true })
  doff_time?: string;

  @Column({ type: "uuid", nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: "source_id" })
  source?: CompSourceEntity;

  @Column({ type: "jsonb", nullable: true })
  raw?: Record<string, unknown>;

  @OneToMany(() => EquipmentCategoryItemEntity, (item) => item.equipment)
  category_items?: EquipmentCategoryItemEntity[];

  @Column({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
