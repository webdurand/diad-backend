import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type JoinRequestStatus = "pending" | "approved" | "rejected";

@Entity("encounter_join_requests")
@Index("IDX_ejr_encounter_character_pending", ["encounterId", "characterId"], {
  unique: true,
  where: `status = 'pending'`,
})
export class EncounterJoinRequestEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "encounter_id", type: "uuid" })
  encounterId: string;

  @Index()
  @Column({ name: "character_id", type: "uuid" })
  characterId: string;

  @Column({ name: "requested_by_user_id", type: "uuid" })
  requestedByUserId: string;

  @Column({ type: "varchar", default: "pending" })
  status: JoinRequestStatus;

  @Column({ name: "rejection_reason", type: "text", nullable: true })
  rejectionReason?: string | null;

  @Column({ name: "resolved_by_user_id", type: "uuid", nullable: true })
  resolvedByUserId?: string | null;

  @Column({ name: "resolved_at", type: "timestamptz", nullable: true })
  resolvedAt?: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
