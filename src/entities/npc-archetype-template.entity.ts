import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { MonsterEntity } from "./monster.entity";


@Entity("npc_archetype_templates")
export class NpcArchetypeTemplateEntity {

  @PrimaryColumn({ type: "varchar", length: 50 })
  slug: string;

  @Column({ name: "monster_id", type: "uuid" })
  monsterId: string;

  @ManyToOne(() => MonsterEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "monster_id" })
  monster: MonsterEntity;


  @Column({ name: "archetype_label_pt", type: "varchar", length: 100 })
  archetypeLabelPt: string;


  @Column({
    name: "hostility_default",
    type: "varchar",
    length: 16,
    default: "neutral",
  })
  hostilityDefault: "volatile" | "low" | "high" | "neutral";


  @Column({ name: "mm_2024_page", type: "int", nullable: true })
  mm2024Page?: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
