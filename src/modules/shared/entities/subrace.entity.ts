import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Subrace, Race, AbilityBonus } from '../interfaces/subrace.interface'; // Ajuste o caminho

@Entity('subraces')
export class SubraceEntity implements Subrace {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'jsonb' })
  race: Race;

  @Column({ type: 'text' })
  desc: string;

  @Column({ type: 'jsonb' })
  ability_bonuses: AbilityBonus[];

  @Column({ type: 'jsonb' })
  racial_traits: Race[];

  @Column()
  url: string;
}
