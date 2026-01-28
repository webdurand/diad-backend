import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';
import { Race } from '../interfaces/race.interface';
import { LanguageEntity } from './language.entity';
import { TraitEntity } from './trait.entity';
import { SubraceEntity } from './subrace.entity';

@Entity('races')
export class RaceEntity implements Race {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column()
  speed: number;

  @Column({ type: 'jsonb' })
  ability_bonuses: Race['ability_bonuses'];

  @Column()
  alignment: string;

  @Column({ type: 'text' })
  age: string;

  @Column()
  size: string;

  @Column({ type: 'text' })
  size_description: string;

  @ManyToMany(() => LanguageEntity)
  @JoinTable()
  languages: LanguageEntity[];

  @Column({ type: 'text' })
  language_desc: string;

  @ManyToMany(() => TraitEntity)
  @JoinTable()
  traits: TraitEntity[];

  @OneToMany(() => SubraceEntity, (subrace) => subrace.race)
  subraces: SubraceEntity[];

  // Campos opcionais salvos como JSONB
  @Column({ type: 'jsonb', nullable: true })
  language_options?: Race['language_options'];

  @Column({ type: 'jsonb', nullable: true })
  ability_bonus_options?: Race['ability_bonus_options'];
}
