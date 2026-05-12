import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { UserEntity } from "./user.entity";

@Entity("admin_audit_log")
@Index(["adminId", "createdAt"])
@Index(["action", "createdAt"])
export class AdminAuditLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "admin_id", type: "uuid" })
  adminId: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "admin_id" })
  admin: UserEntity;

  @Column({ type: "varchar", length: 64 })
  action: string;

  @Column({
    name: "target_entity",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  targetEntity?: string;

  @Column({ name: "target_id", type: "varchar", length: 128, nullable: true })
  targetId?: string;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  details: Record<string, unknown>;

  @Column({ name: "trace_id", type: "varchar", length: 32, nullable: true })
  traceId?: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
