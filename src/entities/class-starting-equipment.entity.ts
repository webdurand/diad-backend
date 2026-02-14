import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ClassEntity } from './class.entity';
import { EquipmentEntity } from './equipment.entity';

@Entity('class_starting_equipment')
export class ClassStartingEquipmentEntity {
  @PrimaryColumn('uuid', { name: 'class_id' })
  class_id: string;

  @PrimaryColumn('uuid', { name: 'equipment_id' })
  equipment_id: string;

  @ManyToOne(() => ClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: ClassEntity;

  @ManyToOne(() => EquipmentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipment_id' })
  equipment: EquipmentEntity;
}
