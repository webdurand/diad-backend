import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { QuestEntity } from "./quest.entity";

@Entity("quest_objectives")
export class QuestObjectiveEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "quest_id", type: "uuid" })
  questId: string;

  @ManyToOne(() => QuestEntity, (q) => q.objectives, { onDelete: "CASCADE" })
  @JoinColumn({ name: "quest_id" })
  quest: QuestEntity;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "varchar", default: "locked" })
  status: "locked" | "active" | "completed" | "failed" | "optional";


  @Column({ name: "path_group", type: "varchar", nullable: true })
  pathGroup?: string;

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  @Column({ name: "is_optional", type: "boolean", default: false })
  isOptional: boolean;

  @Column({ name: "completion_conditions", type: "jsonb", default: {} })
  completionConditions: Record<string, any>;

  @Column({ name: "progress_count", type: "int", default: 0 })
  progressCount: number;

  @Column({ name: "advance_evidence", type: "text", nullable: true })
  advanceEvidence?: string;
}
