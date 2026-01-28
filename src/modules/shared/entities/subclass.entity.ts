import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn, // <--- 1. IMPORTAR ISSO
  // JoinTable, <--- 2. REMOVER ISSO
} from 'typeorm';
import { Subclass } from '../interfaces/subclass.interface';
import { ClassEntity } from './class.entity';

@Entity('subclasses')
export class SubclassEntity implements Subclass {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  // CORREÇÃO AQUI:
  // ManyToOne SEMPRE usa JoinColumn para indicar que a FK (class_id) fica nesta tabela.
  // JoinTable é só para ManyToMany.
  @ManyToOne(() => ClassEntity, (classEntity) => classEntity.subclasses)
  @JoinColumn({ name: 'class_id' })
  class: ClassEntity;

  @Column()
  subclass_flavor: string;

  @Column({ type: 'text', array: true })
  desc: string[];

  @Column()
  subclass_levels: string;

  @Column({ type: 'jsonb', nullable: true })
  spells?: Subclass['spells'];
}
