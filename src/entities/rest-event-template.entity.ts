import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { RestEventTriggered } from "./rest-session.entity";


@Entity("rest_event_templates")
export class RestEventTemplateEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "varchar", length: 40 })
  kind: RestEventTriggered;


  @Column({ name: "trigger_condition", type: "text" })
  triggerCondition: string;

  @Column({ type: "int" })
  weight: number;

  @Column({ name: "narrative_template_id", type: "uuid", nullable: true })
  narrativeTemplateId?: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
