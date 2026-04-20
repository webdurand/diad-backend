import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CharacterEntity } from './character.entity';
import { EquipmentEntity } from './equipment.entity';
import { EquipmentSourceEnum } from './enums';

@Entity('character_equipment')
export class CharacterEquipmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
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

  /**
   * RAW 2024 — weapons-in-hand. Marca qual item está empunhado. ActionBar
   * só expõe weapons com `main_hand=true` ou `off_hand=true` (+ Unarmed
   * Strike, que é intrínseco). Validações de hand occupancy ficam no
   * `EquipmentService.equipHand`: 2H weapon ocupa ambas; shield vai off;
   * dual-wield exige ambas com property `light`.
   */
  @Column({ name: 'main_hand', type: 'boolean', default: false })
  mainHand: boolean;

  @Column({ name: 'off_hand', type: 'boolean', default: false })
  offHand: boolean;

  @Column({
    type: 'enum',
    enum: EquipmentSourceEnum,
    enumName: 'equipment_source_enum',
    default: EquipmentSourceEnum.Starting,
  })
  source: EquipmentSourceEnum;
}
