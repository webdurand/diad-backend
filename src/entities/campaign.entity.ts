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

@Entity('campaigns')
export class CampaignEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  slug: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', nullable: true })
  setting?: string;

  @Column({ type: 'varchar', nullable: true })
  theme?: string;

  @Column({ type: 'varchar', default: 'standard' })
  difficulty: string;

  @Index()
  @Column({ name: 'dm_user_id', type: 'uuid' })
  dmUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dm_user_id' })
  dm: UserEntity;

  @Column({ type: 'varchar', default: 'draft' })
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';

  @Column({ name: 'world_lore', type: 'text', nullable: true })
  worldLore?: string;

  @Column({ name: 'rules_variant', type: 'jsonb', default: {} })
  rulesVariant: Record<string, any>;

  @Column({ name: 'invite_code', type: 'varchar', nullable: true, unique: true })
  inviteCode?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
