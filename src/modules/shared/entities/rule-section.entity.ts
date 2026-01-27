import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { RuleSection } from '../interfaces/rule-section.interface';

@Entity('rule_sections')
export class RuleSectionEntity implements RuleSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  url: string;
}
