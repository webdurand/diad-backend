import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { NpcEntity } from "./npc.entity";
import { FactionEntity } from "./faction.entity";

@Entity("npc_relationships")
export class NpcRelationshipEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "source_npc_id", type: "uuid" })
  sourceNpcId: string;

  @ManyToOne(() => NpcEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "source_npc_id" })
  sourceNpc: NpcEntity;

  @Column({ name: "target_npc_id", type: "uuid", nullable: true })
  targetNpcId?: string;

  @ManyToOne(() => NpcEntity, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "target_npc_id" })
  targetNpc?: NpcEntity;

  @Column({ name: "target_faction_id", type: "uuid", nullable: true })
  targetFactionId?: string;

  @ManyToOne(() => FactionEntity, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "target_faction_id" })
  targetFaction?: FactionEntity;

  @Column({ name: "relationship_type", type: "varchar" })
  relationshipType: string; // family, friend, rival, employer, mentor, enemy, leader, member, agent, etc.

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "int", default: 5 })
  strength: number; // 1-10

  @Column({ name: "is_known_to_party", type: "boolean", default: false })
  isKnownToParty: boolean;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt: Date;
}
