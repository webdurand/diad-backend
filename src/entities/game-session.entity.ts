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
import { UserEntity } from './user.entity';
import { CampaignEntity } from './campaign.entity';

@Entity('game_sessions')
export class GameSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Index()
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: UserEntity;

  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId?: string;

  @ManyToOne(() => CampaignEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'campaign_id' })
  campaign?: CampaignEntity;

  @Column({
    type: 'varchar',
    default: 'lobby',
  })
  status: 'lobby' | 'active' | 'paused' | 'completed';

  @Column({ name: 'character_ids', type: 'jsonb', default: [] })
  characterIds: string[];

  @Column({ name: 'active_encounter_id', type: 'uuid', nullable: true })
  activeEncounterId?: string;

  @Column({ type: 'jsonb', default: {} })
  scene: {
    name?: string;
    description?: string;
    environment?: string;
  };

  @Column({ type: 'jsonb', default: {} })
  config: {
    dice_seed?: number;
    critical_variant?: 'double_dice' | 'double_damage';
  };

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
