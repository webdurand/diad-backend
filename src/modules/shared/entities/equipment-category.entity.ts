import { Entity, Column, PrimaryGeneratedColumn, ManyToMany } from 'typeorm';
import { EquipmentCategory } from '../interfaces/equipment-category.interface';
import { EquipmentEntity } from './equipment.entity';

@Entity('equipment_categories')
export class EquipmentCategoryEntity implements EquipmentCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @ManyToMany(
    () => EquipmentEntity,
    (equipment) => equipment.equipment_categories,
  )
  equipment: EquipmentEntity[];
}
