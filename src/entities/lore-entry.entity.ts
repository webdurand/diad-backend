import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CampaignEntity } from './campaign.entity';

export type LoreEntryEntityType =
  | 'npc'
  | 'location'
  | 'faction'
  | 'lore'
  | 'item';

@Entity('lore_entries')
export class LoreEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: CampaignEntity;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'activation_keys', type: 'jsonb', default: [] })
  activationKeys: string[];

  @Column({ name: 'entity_type', type: 'varchar', default: 'lore' })
  entityType: LoreEntryEntityType;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId?: string;

  @Column({ name: 'is_persistent', type: 'boolean', default: true })
  isPersistent: boolean;

  @Column({ type: 'smallint', default: 5 })
  priority: number;

  @Column({ name: 'max_tokens_inject', type: 'int', default: 400 })
  maxTokensInject: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
