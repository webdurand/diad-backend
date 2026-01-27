import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Equipment } from '../interfaces/equipament.interface';

@Entity('equipment')
export class EquipmentEntity implements Equipment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  weight: number;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column()
  url: string;

  @Column({ nullable: true })
  image?: string;

  // Estruturas JSONB
  @Column({ type: 'jsonb' })
  equipment_categories: Equipment['equipment_categories'];

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
