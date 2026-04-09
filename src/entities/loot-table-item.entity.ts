import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LootTableEntity } from './loot-table.entity';
import { EquipmentEntity } from './equipment.entity';
import { MagicItemEntity } from './magic-item.entity';

@Entity('loot_table_items')
export class LootTableItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'loot_table_id', type: 'uuid' })
  lootTableId: string;

  @ManyToOne(() => LootTableEntity, (lt) => lt.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loot_table_id' })
  lootTable: LootTableEntity;

  @Column({ name: 'equipment_id', type: 'uuid', nullable: true })
  equipmentId?: string;

  @ManyToOne(() => EquipmentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'equipment_id' })
  equipment?: EquipmentEntity;

  @Column({ name: 'magic_item_id', type: 'uuid', nullable: true })
  magicItemId?: string;

  @ManyToOne(() => MagicItemEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'magic_item_id' })
  magicItem?: MagicItemEntity;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ name: 'price_override', type: 'jsonb', nullable: true })
  priceOverride?: Record<string, any>;

  @Column({ name: 'drop_chance', type: 'float', default: 1.0 })
  dropChance: number;
}
