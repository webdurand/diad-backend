import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Race } from '../interfaces/race.interface';

@Entity('races')
export class RaceEntity implements Race {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column()
  speed: number;

  @Column({ type: 'jsonb' })
  ability_bonuses: Race['ability_bonuses'];

  @Column({ type: 'text' })
  alignment: string;

  @Column({ type: 'text' })
  age: string;

  @Column()
  size: string;

  @Column({ type: 'text' })
  size_description: string;

  @Column({ type: 'jsonb' })
  languages: Race['languages'];

  @Column({ type: 'text' })
  language_desc: string;

  @Column({ type: 'jsonb' })
  traits: Race['traits'];

  @Column({ type: 'jsonb' })
  subraces: Race['subraces'];
  @Column()
  url: string;

  // Campos opcionais salvos como JSONB
  @Column({ type: 'jsonb', nullable: true })
  language_options?: Race['language_options'];

  @Column({ type: 'jsonb', nullable: true })
  ability_bonus_options?: Race['ability_bonus_options'];
}
