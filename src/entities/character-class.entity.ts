import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CharacterEntity } from './character.entity';
import { ClassEntity } from './class.entity';
import { SubclassEntity } from './subclass.entity';

@Entity('character_classes')
export class CharacterClassEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  character_id: string;

  @ManyToOne(() => CharacterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: CharacterEntity;

  @Column({ type: 'uuid' })
  class_id: string;

  @ManyToOne(() => ClassEntity, { eager: true })
  @JoinColumn({ name: 'class_id' })
  class: ClassEntity;

  @Column({ type: 'uuid', nullable: true })
  subclass_id?: string;

  @ManyToOne(() => SubclassEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'subclass_id' })
  subclass?: SubclassEntity;

  @Column({ type: 'int', default: 1 })
  class_level: number;

  @Column({ type: 'int', default: 1 })
  order: number;
}
