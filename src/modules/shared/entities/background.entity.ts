import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Background } from '../interfaces/background.interface';

@Entity('backgrounds')
export class BackgroundEntity implements Background {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'jsonb' })
  ability_scores: Background['ability_scores'];

  @Column({ type: 'jsonb' })
  feat: Background['feat'];

  @Column({ type: 'jsonb' })
  proficiencies: Background['proficiencies'];

  @Column({ type: 'jsonb' })
  equipment_options: Background['equipment_options'];

  @Column()
  url: string;

  @Column({ type: 'jsonb', nullable: true })
  proficiency_choices?: Background['proficiency_choices'];
}
