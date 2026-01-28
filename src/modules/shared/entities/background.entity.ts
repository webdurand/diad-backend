import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  JoinTable,
  ManyToOne,
} from 'typeorm';
import { Background } from '../interfaces/background.interface';
import { AbilityScoreEntity } from './ability-score.entity';
import { FeatEntity } from './feat.entity';
import { ProficiencyEntity } from './proficiency.entity';

@Entity('backgrounds')
export class BackgroundEntity implements Background {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @ManyToMany(() => AbilityScoreEntity)
  @JoinTable()
  ability_scores: AbilityScoreEntity[];

  @ManyToOne(() => FeatEntity)
  feat: FeatEntity;

  @ManyToMany(() => ProficiencyEntity)
  @JoinTable()
  proficiencies: ProficiencyEntity[];

  @Column({ type: 'jsonb' })
  equipment_options: Background['equipment_options'];

  @Column({ type: 'jsonb', nullable: true })
  proficiency_choices?: Background['proficiency_choices'];
}
