import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { AbilityScore } from '../interfaces/ability-score.interface';
import { SkillEntity } from './skill.entity';

@Entity('ability_scores')
export class AbilityScoreEntity implements AbilityScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column()
  full_name: string;

  @Column({ type: 'text' })
  description: string;

  @OneToMany(() => SkillEntity, (skill) => skill.ability_score)
  skills: SkillEntity[];
}
