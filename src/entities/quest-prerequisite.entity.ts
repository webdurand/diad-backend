import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { QuestEntity } from "./quest.entity";

@Entity("quest_prerequisites")
@Unique(["questId", "requiredQuestId"])
export class QuestPrerequisiteEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "quest_id", type: "uuid" })
  questId: string;

  @ManyToOne(() => QuestEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "quest_id" })
  quest: QuestEntity;

  @Column({ name: "required_quest_id", type: "uuid" })
  requiredQuestId: string;

  @ManyToOne(() => QuestEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "required_quest_id" })
  requiredQuest: QuestEntity;

  @Column({ name: "required_status", type: "varchar", default: "completed" })
  requiredStatus: string;
}
