import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CharacterEntity } from './character.entity';
import { MagicItemEntity } from './magic-item.entity';

@Entity('character_magic_items')
export class CharacterMagicItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  character_id: string;

  @ManyToOne(() => CharacterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: CharacterEntity;

  @Column({ type: 'uuid' })
  magic_item_id: string;

  @ManyToOne(() => MagicItemEntity, { eager: true })
  @JoinColumn({ name: 'magic_item_id' })
  magic_item: MagicItemEntity;

  @Column({ type: 'boolean', default: false })
  attuned: boolean;
}
