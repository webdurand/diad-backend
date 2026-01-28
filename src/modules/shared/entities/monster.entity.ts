import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Monster, MonsterType, Size } from '../interfaces/monster.interface';

@Entity('monsters')
export class MonsterEntity implements Monster {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column()
  size: Size;

  @Column()
  type: MonsterType;

  @Column() alignment: string;

  @Column({ type: 'jsonb' })
  armor_class: Monster['armor_class'];

  @Column()
  hit_points: number;

  @Column()
  hit_dice: string;

  @Column()
  hit_points_roll: string;

  @Column({ type: 'jsonb' })
  speed: Monster['speed'];

  @Column()
  strength: number;

  @Column()
  dexterity: number;

  @Column()
  constitution: number;

  @Column()
  intelligence: number;

  @Column()
  wisdom: number;

  @Column()
  charisma: number;

  @Column({ type: 'jsonb' })
  proficiencies: Monster['proficiencies'];

  @Column({ type: 'jsonb' })
  damage_vulnerabilities: string[];

  @Column({ type: 'jsonb' })
  damage_resistances: string[];

  @Column({ type: 'jsonb' })
  damage_immunities: string[];

  @Column({ type: 'jsonb' })
  condition_immunities: Monster['condition_immunities'];

  @Column({ type: 'jsonb' })
  senses: Monster['senses'];

  @Column({ type: 'text' })
  languages: string;

  @Column({ type: 'float' })
  challenge_rating: number;

  @Column()
  proficiency_bonus: number;

  @Column()
  xp: number;

  @Column({ type: 'jsonb', nullable: true })
  special_abilities?: Monster['special_abilities'];

  @Column({ type: 'jsonb', nullable: true })
  actions?: Monster['actions'];

  @Column({ type: 'jsonb', nullable: true })
  legendary_actions?: Monster['legendary_actions'];

  @Column({ type: 'text', nullable: true })
  image: string;

  @Column({ type: 'text', nullable: true })
  desc?: string;

  @Column({ nullable: true })
  subtype?: string;

  @Column({ type: 'jsonb', nullable: true })
  reactions?: Monster['reactions'];

  @Column({ type: 'jsonb', nullable: true })
  forms?: Monster['forms'];
}
