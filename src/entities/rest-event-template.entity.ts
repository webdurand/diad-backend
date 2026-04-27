import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { RestEventTriggered } from "./rest-session.entity";

/**
 * Spec 016 — RestEventTemplate (camp events pool, BG3-inspired).
 *
 * Director picker faz weighted roll, max 1 event/long rest. Anti-overload.
 * Templates concretos seedados via migration M4 (M0 só estrutura).
 *
 * Ver `specs/016-play-shell-foundation/spec.md` §6.3.
 */
@Entity("rest_event_templates")
export class RestEventTemplateEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "varchar", length: 40 })
  kind: RestEventTriggered;

  /**
   * Pseudo-DSL ou função (avaliada server-side).
   * Ex: `bond_score>5 AND intro_scene>2_scenes_ago`
   */
  @Column({ name: "trigger_condition", type: "text" })
  triggerCondition: string;

  @Column({ type: "int" })
  weight: number;

  @Column({ name: "narrative_template_id", type: "uuid", nullable: true })
  narrativeTemplateId?: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
