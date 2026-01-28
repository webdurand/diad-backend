import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Subrace, AbilityBonus } from '../interfaces/subrace.interface';
import { TraitEntity } from './trait.entity';
import { RaceEntity } from './race.entity';

@Entity('subraces')
export class SubraceEntity implements Subrace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @ManyToOne(() => RaceEntity, (race) => race.subraces)
  race: RaceEntity;

  @Column({ type: 'text' })
  desc: string;

  @Column({ type: 'jsonb' })
  ability_bonuses: AbilityBonus[];

  @ManyToMany(() => TraitEntity)
  @JoinTable()
  racial_traits: TraitEntity[];

  @Column()
  url: string;
}
