import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { RuleEntity } from './rule.entity';
import { RuleSectionEntity } from './rule-section.entity';

@Entity('rule_section_links')
export class RuleSectionLinkEntity {
  @PrimaryColumn('uuid', { name: 'rule_id' })
  rule_id: string;

  @PrimaryColumn('uuid', { name: 'section_id' })
  section_id: string;

  @ManyToOne(() => RuleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule: RuleEntity;

  @ManyToOne(() => RuleSectionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_id' })
  section: RuleSectionEntity;
}