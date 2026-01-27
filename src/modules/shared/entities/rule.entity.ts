import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Rule } from '../interfaces/rule.interface';

@Entity('rules')
export class RuleEntity implements Rule {
  @PrimaryGeneratedColumn()
  id: number;

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
