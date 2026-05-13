import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { CampaignEntity } from "./campaign.entity";

@Entity("locations")
@Unique(["campaignId", "slug"])
export class LocationEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "campaign_id", type: "uuid" })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "campaign_id" })
  campaign: CampaignEntity;

  @Column({ name: "parent_id", type: "uuid", nullable: true })
  parentId?: string;

  @ManyToOne(() => LocationEntity, (l) => l.children, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "parent_id" })
  parent?: LocationEntity;

  @OneToMany(() => LocationEntity, (l) => l.parent)
  children?: LocationEntity[];

  @Column({ type: "varchar" })
  name: string;

  @Column({ type: "varchar" })
  slug: string;

  @Column({ type: "varchar" })
  type: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ name: "description_hidden", type: "text", nullable: true })
  descriptionHidden?: string;

  @Column({ type: "varchar", nullable: true })
  atmosphere?: string;

  @Column({ type: "jsonb", default: [] })
  tags: string[];

  @Column({ type: "jsonb", default: {} })
  properties: Record<string, any>;

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  @Column({ name: "visited_at", type: "timestamptz", nullable: true })
  visitedAt?: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
