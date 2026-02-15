import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CharacterEntity } from './character.entity';
import { ClassEntity } from './class.entity';
import { HpMethodEnum } from './enums';

@Entity('character_level_ups')
export class CharacterLevelUpEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  character_id: string;

  @ManyToOne(() => CharacterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: CharacterEntity;

  @Column({ type: 'int' })
  total_level: number;

  @Column({ type: 'uuid' })
  class_id: string;

  @ManyToOne(() => ClassEntity, { eager: true })
  @JoinColumn({ name: 'class_id' })
  class: ClassEntity;

  @Column({ type: 'int' })
  hp_gained: number;

  @Column({
    type: 'enum',
    enum: HpMethodEnum,
    enumName: 'hp_method_enum',
  })
  hp_method: HpMethodEnum;

  @Column({ type: 'jsonb', default: {} })
  choices: Record<string, unknown>;
}
