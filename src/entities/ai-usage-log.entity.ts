import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CampaignEntity } from './campaign.entity';
import { GameSessionEntity } from './game-session.entity';

export type AiAgentRole =
  | 'director'
  | 'narrator'
  | 'archivist'
  | 'combat'
  | 'oracle'
  | 'summarizer';

@Entity('ai_usage_logs')
@Index(['campaignId', 'createdAt'])
@Index(['sessionId', 'createdAt'])
export class AiUsageLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId?: string;

  @ManyToOne(() => CampaignEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign?: CampaignEntity;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId?: string;

  @ManyToOne(() => GameSessionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'session_id' })
  session?: GameSessionEntity;

  @Column({ name: 'agent_role', type: 'varchar', length: 32 })
  agentRole: AiAgentRole;

  @Column({ name: 'model_id', type: 'varchar', length: 64 })
  modelId: string;

  @Column({ name: 'input_tokens', type: 'int', default: 0 })
  inputTokens: number;

  @Column({ name: 'output_tokens', type: 'int', default: 0 })
  outputTokens: number;

  @Column({ name: 'cache_creation_tokens', type: 'int', default: 0 })
  cacheCreationTokens: number;

  @Column({ name: 'cache_read_tokens', type: 'int', default: 0 })
  cacheReadTokens: number;

  @Column({ name: 'cost_usd', type: 'numeric', precision: 10, scale: 6, default: 0 })
  costUsd: string;

  @Column({ name: 'took_ms', type: 'int', nullable: true })
  tookMs?: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
