import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import {
  AreaOfEffect,
  AttackType,
  CastingTime,
  Component,
  Damage,
  Dc,
  Range,
  School,
  Spell,
} from '../interfaces/spell.interface';

@Entity('spells')
export class SpellEntity implements Spell {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'text', array: true })
  desc: string[];

  @Column({ type: 'text', array: true, nullable: true })
  higher_level?: string[];

  @Column({ type: 'enum', enum: Range })
  range: Range;

  @Column({ type: 'jsonb' })
  components: Component[];

  @Column({ nullable: true })
  material?: string;

  @Column()
  ritual: boolean;

  @Column()
  duration: string;

  @Column()
  concentration: boolean;

  @Column({ type: 'enum', enum: CastingTime })
  casting_time: CastingTime;

  @Column()
  level: number;

  @Column({ type: 'enum', enum: AttackType, nullable: true })
  attack_type?: AttackType;

  @Column({ type: 'jsonb', nullable: true })
  damage?: Damage;

  @Column({ type: 'jsonb' })
  school: School;

  @Column({ type: 'jsonb' })
  classes: School[];

  @Column({ type: 'jsonb' })
  subclasses: School[];

  @Column()
  url: string;

  @Column({ type: 'jsonb', nullable: true })
  dc?: Dc;

  @Column({ type: 'jsonb', nullable: true })
  heal_at_slot_level?: { [key: string]: string };

  @Column({ type: 'jsonb', nullable: true })
  area_of_effect?: AreaOfEffect;
}
