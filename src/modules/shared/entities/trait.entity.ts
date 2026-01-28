import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  JoinTable,
  ManyToOne,
} from 'typeorm';

import { RaceEntity } from './race.entity';
import { SubraceEntity } from './subrace.entity';
import { ProficiencyEntity } from './proficiency.entity';
import {
  ChoiceOption,
  Trait,
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

  @ManyToMany(() => RaceEntity)
  @JoinTable()
  races: RaceEntity[];

  @ManyToMany(() => SubraceEntity)
  @JoinTable()
  subraces: SubraceEntity[];

  @Column({ type: 'text', array: true })
  desc: string[];

  @ManyToMany(() => ProficiencyEntity)
  @JoinTable()
  proficiencies: ProficiencyEntity[];

  @Column({ type: 'jsonb', nullable: true })
  proficiency_choices?: ChoiceOption;

  @Column({ type: 'jsonb', nullable: true })
  trait_specific?: TraitSpecific;

  @Column({ type: 'jsonb', nullable: true })
  language_options?: ChoiceOption;

  @ManyToOne(() => TraitEntity, { nullable: true }) // Removido { eager: true }
  parent?: TraitEntity;
}
