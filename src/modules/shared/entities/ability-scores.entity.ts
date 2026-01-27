import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { AbilityScore } from '../interfaces/ability-score.interface';

@Entity('ability_scores')
export class AbilityScoreEntity implements AbilityScore {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  index: string; // Ex: "str", "dex"

  @Column()
  name: string; // Ex: "STR", "DEX"

  @Column()
  full_name: string; // Ex: "Strength", "Dexterity"

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb' })
  skills: AbilityScore['skills'];

  @Column()
  url: string;
}
