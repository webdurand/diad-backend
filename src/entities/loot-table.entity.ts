import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CampaignEntity } from './campaign.entity';
import { LocationEntity } from './location.entity';
import { NpcEntity } from './npc.entity';
import { LootTableItemEntity } from './loot-table-item.entity';

@Entity('loot_tables')
export class LootTableEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: CampaignEntity;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId?: string;

  @ManyToOne(() => LocationEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'location_id' })
  location?: LocationEntity;

  @Column({ name: 'npc_id', type: 'uuid', nullable: true })
  npcId?: string;

  @ManyToOne(() => NpcEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'npc_id' })
  npc?: NpcEntity;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'is_shop', type: 'boolean', default: false })
  isShop: boolean;

  @Column({ name: 'is_looted', type: 'boolean', default: false })
  isLooted: boolean;

  @OneToMany(() => LootTableItemEntity, (i) => i.lootTable)
  items?: LootTableItemEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
