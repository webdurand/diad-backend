import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SpellEntity } from './spell.entity';
import { ClassEntity } from './class.entity';

@Entity('spell_classes')
export class SpellClassEntity {
  @PrimaryColumn('uuid', { name: 'spell_id' })
  spell_id: string;

  @PrimaryColumn('uuid', { name: 'class_id' })
  class_id: string;

  @ManyToOne(() => SpellEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'spell_id' })
  spell: SpellEntity;

  @ManyToOne(() => ClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: ClassEntity;
}
