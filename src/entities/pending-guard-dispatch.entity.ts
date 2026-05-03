import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

export type PendingGuardDispatchStatus =
  | "pending"
  | "materialized"
  | "expired"
  | "cancelled";

@Entity("pending_guard_dispatches")
@Index(["sessionId", "status", "targetSequence"])
export class PendingGuardDispatchEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @Column({ name: "session_id", type: "uuid" })
  sessionId: string;

  @Column({ name: "location_id", type: "uuid" })
  locationId: string;

  @Column({ name: "guard_npc_ids", type: "uuid", array: true })
  guardNpcIds: string[];

  @Column({ name: "target_sequence", type: "int" })
  targetSequence: number;

  @Column({ type: "varchar", length: 20, default: "pending" })
  status: PendingGuardDispatchStatus;

  @Column({ name: "source_event_id", type: "uuid", nullable: true })
  sourceEventId?: string | null;

  @Column({ type: "smallint", default: 2 })
  severity: number;

  @Column({
    name: "dispatch_reason",
    type: "varchar",
    length: 40,
    nullable: true,
  })
  dispatchReason?: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @Column({ name: "materialized_at", type: "timestamptz", nullable: true })
  materializedAt?: Date | null;

  @Column({
    name: "materialized_encounter_id",
    type: "uuid",
    nullable: true,
  })
  materializedEncounterId?: string | null;
}
