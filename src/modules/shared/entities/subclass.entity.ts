import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Class, Spell, Subclass } from '../interfaces/subclass.interface';

@Entity('subclasses')
export class SubclassEntity implements Subclass {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'jsonb' })
  class: Class;

  @Column()
  subclass_flavor: string;

  @Column({ type: 'text', array: true })
  desc: string[];

  @Column()
  subclass_levels: string;

  @Column({ type: 'jsonb', nullable: true })
  spells?: Spell[];

  @Column()
  url: string;
}
