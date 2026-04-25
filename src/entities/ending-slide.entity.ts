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

export type EndingSlideCategory =
  | 'companion'
  | 'faction'
  | 'world'
  | 'personal_arc'
  | 'npc_major'
  | 'location_major';

export type EndingSlideSubjectType =
  | 'npc'
  | 'faction'
  | 'location'
  | 'campaign'
  | 'party';

export type EndingSlideTone =
  | 'hopeful'
  | 'bittersweet'
  | 'tragic'
  | 'neutral'
  | 'triumphant'
  | 'ambiguous';

export interface EndingSlideCondition {
  type:
    | 'entity_status_equals'
    | 'decision_tag_present'
    | 'decision_impact_gte'
    | 'vow_status_equals'
    | 'clock_full'
    | 'question_answered'
    | 'arc_beat_reached';
  entityId?: string;
  expectedValue?: string | number | boolean;
  negate?: boolean;
}

@Entity('ending_slides')
@Index(['campaignId', 'category'])
export class EndingSlideEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @ManyToOne(() => CampaignEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign: CampaignEntity;

  @Column({ type: 'varchar' })
  category: EndingSlideCategory;

  @Column({ name: 'subject_type', type: 'varchar' })
  subjectType: EndingSlideSubjectType;

  @Column({ name: 'subject_id', type: 'uuid', nullable: true })
  subjectId?: string;

  @Column({ name: 'template_text', type: 'text' })
  templateText: string;

  @Column({ type: 'jsonb', default: [] })
  conditions: EndingSlideCondition[];

  @Column({ type: 'smallint', default: 10 })
  priority: number;

  @Column({ name: 'required_flags', type: 'jsonb', default: [] })
  requiredFlags: string[];

  @Column({ name: 'renders_tone', type: 'varchar', default: 'neutral' })
  rendersTone: EndingSlideTone;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
