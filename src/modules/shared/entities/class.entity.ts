import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Class } from '../interfaces/class.interface';

@Entity('classes')
export class ClassEntity implements Class {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column()
  hit_die: number;

  @Column({ type: 'jsonb' })
  proficiency_choices: Class['proficiency_choices'];

  @Column({ type: 'jsonb' })
  proficiencies: Class['proficiencies'];

  @Column({ type: 'jsonb' })
  saving_throws: Class['saving_throws'];

  @Column({ type: 'jsonb' })
  starting_equipment: Class['starting_equipment'];

  @Column({ type: 'jsonb' })
  starting_equipment_options: Class['starting_equipment_options'];

  @Column()
  class_levels: string;

  @Column({ type: 'jsonb' })
  multi_classing: Class['multi_classing'];

  @Column({ type: 'jsonb' })
  subclasses: Class['subclasses'];

  @Column()
  url: string;

  @Column({ type: 'jsonb', nullable: true })
  spellcasting?: Class['spellcasting'];

  @Column({ nullable: true })
  spells?: string;
}
