import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { CompSourceEntity } from './comp-source.entity';
import { EquipmentCategoryEntity } from './equipment-category.entity';
import { MagicItemVariantEntity } from './magic-item-variant.entity';

@Entity('magic_items')
export class MagicItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'jsonb' })
  rarity: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  is_variant: boolean;

  @Column({ type: 'jsonb' })
  description: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  image?: string;

  @Column({ type: 'text', nullable: true })
  url?: string;

  @Column({ type: 'numeric', default: 0 })
  weight: string;

  @Column({ type: 'jsonb', nullable: true })
  cost?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  attunement?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  bonuses?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  charges_info?: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  equipment_category_id?: string;

  @ManyToOne(() => EquipmentCategoryEntity, { nullable: true })
  @JoinColumn({ name: 'equipment_category_id' })
  equipment_category?: EquipmentCategoryEntity;

  @Column({ type: 'uuid', nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: 'source_id' })
  source?: CompSourceEntity;

  @Column({ type: 'jsonb', nullable: true })
  raw?: Record<string, unknown>;

  @OneToMany(() => MagicItemVariantEntity, (item) => item.magic_item)
  variant_links?: MagicItemVariantEntity[];

  @OneToMany(() => MagicItemVariantEntity, (item) => item.variant_magic_item)
  as_variant_links?: MagicItemVariantEntity[];

  @Column({ type: 'timestamptz', default: () => 'now()' })
  created_at: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updated_at: Date;
}
