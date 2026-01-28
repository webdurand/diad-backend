import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Rule } from '../interfaces/rule.interface';
import { RuleSectionEntity } from './rule-section.entity';

@Entity('rules')
export class RuleEntity implements Rule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  desc: string;

  @ManyToMany(() => RuleSectionEntity, { eager: true })
  @JoinTable()
  subsections: RuleSectionEntity[];

  @Column()
  url: string;
}
