import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { MagicItem } from '../interfaces/magic-item.interface';

@Entity('magic_items')
export class MagicItemEntity implements MagicItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  index: string;

  @Column()
  name: string;

  // Categoria (Ex: Armor, Wondrous Item)
  @Column({ name: 'equipment_category', type: 'json' })
  equipment_category: MagicItem['equipment_category'];

  // Rarity salva como objeto para manter compatibilidade com o JSON original
  @Column({ type: 'json' })
  rarity: MagicItem['rarity'];

  @Column({ type: 'boolean', default: false })
  variant: boolean;

  // Lista de referências para outras variantes deste item
  @Column({ type: 'json' })
  variants: MagicItem['variants'];

  // Array de strings contendo a descrição e tabelas
  @Column({ type: 'json' })
  desc: string[];

  @Column({ nullable: true })
  image: string;

  @Column()
  url: string;
}
