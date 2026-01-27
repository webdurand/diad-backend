import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('races')
export class RaceEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column()
  speed: number;

  @Column({ type: 'jsonb', nullable: true })
  ability_bonuses: {
    ability_score: { name: string; index: string; url: string };
    bonus: number;
  }[];

  @Column({ type: 'text' })
  alignment: string;

  @Column({ type: 'text' })
  age: string;

  @Column()
  size: string;

  @Column({ type: 'text' })
  size_description: string;

  @Column({ type: 'jsonb' })
  languages: { name: string; index: string; url: string }[];

  @Column({ type: 'jsonb', nullable: true })
  language_options: object;

  @Column({ type: 'text' })
  language_desc: string;

  @Column({ type: 'jsonb' })
  traits: { name: string; index: string; url: string }[];

  @Column({ type: 'jsonb' })
  subraces: { name: string; index: string; url: string }[];

  @Column()
  url: string;
}
