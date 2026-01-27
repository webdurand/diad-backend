import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Skill } from '../interfaces/skill.interface';
import { AbilityScoreEntity } from './ability-score.entity';

@Entity('skills')
export class SkillEntity implements Skill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @ManyToOne(() => AbilityScoreEntity, (abilityScore) => abilityScore.skills)
  ability_score: AbilityScoreEntity;
}
