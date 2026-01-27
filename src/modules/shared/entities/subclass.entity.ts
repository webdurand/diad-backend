import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Spell, Subclass } from '../interfaces/subclass.interface';
import { ClassEntity } from './class.entity';

@Entity('subclasses')
export class SubclassEntity implements Subclass {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @ManyToOne(() => ClassEntity, (classEntity) => classEntity.subclasses)
  class: ClassEntity;

  @Column()
  subclass_flavor: string;

  @Column({ type: 'text', array: true })
  desc: string[];

  @Column()
  subclass_levels: string;

  @Column({ type: 'jsonb', nullable: true })
  spells?: Spell[];
}
