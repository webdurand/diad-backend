import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Rule } from '../interfaces/rule.interface';

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

  @Column({ type: 'jsonb' })
  subsections: Rule['subsections'];

  @Column()
  url: string;
}
