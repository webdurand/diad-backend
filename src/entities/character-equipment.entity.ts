import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CharacterEntity } from './character.entity';
import { EquipmentEntity } from './equipment.entity';
import { EquipmentSourceEnum } from './enums';

@Entity('character_equipment')
export class CharacterEquipmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  character_id: string;

  @ManyToOne(() => CharacterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: CharacterEntity;

  @Column({ type: 'uuid' })
  equipment_id: string;

  @ManyToOne(() => EquipmentEntity, { eager: true })
  @JoinColumn({ name: 'equipment_id' })
  equipment: EquipmentEntity;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'boolean', default: false })
  equipped: boolean;

  @Column({
    type: 'enum',
    enum: EquipmentSourceEnum,
    enumName: 'equipment_source_enum',
    default: EquipmentSourceEnum.Starting,
  })
  source: EquipmentSourceEnum;
}
