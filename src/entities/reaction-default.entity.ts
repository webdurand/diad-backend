import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";


export type ReactionState = "auto" | "ask" | "off";

@Entity("reaction_defaults")
@Unique(["classSlug", "reactionName"])
export class ReactionDefaultEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "class_slug", type: "varchar", length: 50 })
  classSlug: string;

  @Column({ name: "reaction_name", type: "varchar", length: 60 })
  reactionName: string;

  @Column({ name: "default_state", type: "varchar", length: 10 })
  defaultState: ReactionState;

  @Column({ name: "consumes_spell_slot", type: "boolean", default: false })
  consumesSpellSlot: boolean;

  @Column({ type: "text", nullable: true })
  description?: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
