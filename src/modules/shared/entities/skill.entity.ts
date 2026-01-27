import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Skill, AbilityScore } from '../interfaces/skill.interface';

@Entity('skills')
export class SkillEntity implements Skill {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb' })
  ability_score: AbilityScore;

  @Column()
  url: string;
}
