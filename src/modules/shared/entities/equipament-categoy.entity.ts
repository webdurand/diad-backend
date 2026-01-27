import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { EquipmentCategory } from '../interfaces/equipament-categories.interface';

@Entity('equipment_categories')
export class EquipmentCategoryEntity implements EquipmentCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  // Armazena a lista de referências de itens como JSONB
  @Column({ type: 'jsonb' })
  equipment: EquipmentCategory['equipment'];

  @Column()
  url: string;
}
