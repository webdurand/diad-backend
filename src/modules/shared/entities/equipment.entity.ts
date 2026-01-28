import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Equipment } from '../interfaces/equipment.interface';
import { EquipmentCategoryEntity } from './equipment-category.entity';

@Entity('equipments')
export class EquipmentEntity implements Equipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  weight: number;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  image?: string;

  @ManyToMany(() => EquipmentCategoryEntity, (category) => category.equipment, {
    cascade: true, // Permite criar/atualizar categorias se vierem no JSON
  })
  @JoinTable({ name: 'equipments_categories_relation' }) // Cria a tabela pivo automaticamente
  equipment_categories: EquipmentCategoryEntity[];

  @Column({ type: 'jsonb' })
  cost: Equipment['cost'];

  // Campos de combate (Armas e Armaduras)
  @Column({ type: 'jsonb', nullable: true })
  damage?: Equipment['damage'];

  @Column({ type: 'jsonb', nullable: true })
  armor_class?: Equipment['armor_class'];

  @Column({ type: 'jsonb', nullable: true })
  properties?: Equipment['properties'];

  // Campos de utilitários (Ferramentas e Packs)
  @Column({ type: 'jsonb', nullable: true })
  utilize?: Equipment['utilize'];

  @Column({ type: 'jsonb', nullable: true })
  contents?: Equipment['contents'];

  @Column({ type: 'jsonb', nullable: true })
  craft?: Equipment['craft'];

  // Outros metadados estruturados
  @Column({ type: 'jsonb', nullable: true })
  range?: Equipment['range'];
}
