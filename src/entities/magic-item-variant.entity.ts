import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { MagicItemEntity } from './magic-item.entity';

@Entity('magic_item_variants')
export class MagicItemVariantEntity {
  @PrimaryColumn('uuid', { name: 'magic_item_id' })
  magic_item_id: string;

  @PrimaryColumn('uuid', { name: 'variant_magic_item_id' })
  variant_magic_item_id: string;

  @ManyToOne(() => MagicItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'magic_item_id' })
  magic_item: MagicItemEntity;

  @ManyToOne(() => MagicItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_magic_item_id' })
  variant_magic_item: MagicItemEntity;
}
