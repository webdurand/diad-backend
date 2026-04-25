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
import { SceneEntity } from './scene.entity';

export type NarrativeDecisionTag =
  | 'violence'
  | 'mercy'
  | 'alliance_formed'
  | 'betrayal'
  | 'oath_sworn'
  | 'moral_gray'
  | 'heroic'
  | 'cowardly'
  | 'secret_kept'
  | 'bond_forged';

export type NarrativeDecisionPayoffWindow = 'immediate' | 'act' | 'campaign';

export type NarrativeDecisionAffectedEntityType =
  | 'npc'
  | 'location'
  | 'quest'
  | 'faction'
  | 'party'
  | 'item';

export type NarrativeDecisionExtractedBy =
  | 'archivist_agent'
  | 'player_explicit'
  | 'event_trigger';

export interface NarrativeDecisionProvenance {
  sourceTurn?: number;
  extractedBy: NarrativeDecisionExtractedBy;
  confidence: number;
}

@Entity('narrative_decisions')
@Index(['campaignId', 'createdAt'])
export class NarrativeDecisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: CampaignEntity;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId?: string;

  @ManyToOne(() => GameSessionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'session_id' })
  session?: GameSessionEntity;

  @Column({ name: 'scene_id', type: 'uuid', nullable: true })
  sceneId?: string;

  @ManyToOne(() => SceneEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'scene_id' })
  scene?: SceneEntity;

  @Column({ name: 'actor_participant_id', type: 'uuid', nullable: true })
  actorParticipantId?: string;

  @Column({ name: 'decision_text', type: 'text' })
  decisionText: string;

  @Column({ name: 'affected_entity_type', type: 'varchar', nullable: true })
  affectedEntityType?: NarrativeDecisionAffectedEntityType;

  @Column({ name: 'affected_entity_id', type: 'uuid', nullable: true })
  affectedEntityId?: string;

  @Column({ type: 'jsonb', default: [] })
  tags: NarrativeDecisionTag[];

  @Column({ name: 'impact_weight', type: 'smallint', default: 5 })
  impactWeight: number;

  @Column({ name: 'payoff_window', type: 'varchar', default: 'act' })
  payoffWindow: NarrativeDecisionPayoffWindow;

  @Column({ name: 'payoff_scene_target', type: 'int', nullable: true })
  payoffSceneTarget?: number;

  @Column({ name: 'payoff_realized_at_scene', type: 'int', nullable: true })
  payoffRealizedAtScene?: number;

  @Column({ type: 'jsonb', default: {} })
  provenance: NarrativeDecisionProvenance;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
