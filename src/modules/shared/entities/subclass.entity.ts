import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinTable,
} from 'typeorm';
import { Subclass } from '../interfaces/subclass.interface';
// import { SpellEntity } from './spell.entity';
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
  @JoinTable()
  class: ClassEntity;

  @Column()
  subclass_flavor: string;

  @Column({ type: 'text', array: true })
  desc: string[];

  @Column()
  subclass_levels: string;

  // O campo spells deve seguir a interface Spell[] de subclass.interface.ts
  // Portanto, armazenamos como JSON, não como relação
  @Column({ type: 'jsonb', nullable: true })
  spells?: Subclass['spells'];
}
