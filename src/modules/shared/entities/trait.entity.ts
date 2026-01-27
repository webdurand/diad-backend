import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import {
  Trait,
  ChoiceOption,
  TraitSpecific,
} from '../interfaces/trait.interface';

@Entity('traits')
export class TraitEntity implements Trait {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'jsonb' })
  races: Trait['races'];

  @Column({ type: 'jsonb' })
  subraces: Trait['subraces'];

  @Column({ type: 'text', array: true })
  desc: string[];

  @Column({ type: 'jsonb' })
  proficiencies: Trait['proficiencies'];

  @Column({ type: 'jsonb', nullable: true })
  proficiency_choices?: ChoiceOption;

  @Column({ type: 'jsonb', nullable: true })
  trait_specific?: TraitSpecific;

  @Column({ type: 'jsonb', nullable: true })
  language_options?: ChoiceOption;

  @Column({ type: 'jsonb', nullable: true })
  parent?: Trait['parent'];

  @Column()
  url: string;
}
