import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { MagicItem } from '../interfaces/magic-item.interface';
import { EquipmentCategoryEntity } from './equipment-category.entity';

@Entity('magic_items')
export class MagicItemEntity implements MagicItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  index: string;

  @Column()
  name: string;

  @ManyToOne(() => EquipmentCategoryEntity, { eager: true })
  equipment_category: EquipmentCategoryEntity;

  @Column({ type: 'json' })
  rarity: MagicItem['rarity'];

  @Column({ type: 'boolean', default: false })
  variant: boolean;

  @ManyToMany(() => MagicItemEntity, { eager: true })
  @JoinTable({ name: 'magic_item_variants' })
  variants: MagicItemEntity[];

  @Column({ type: 'json' })
  desc: string[];

  @Column({ nullable: true })
  image: string;

  @Column()
  url: string;
}
