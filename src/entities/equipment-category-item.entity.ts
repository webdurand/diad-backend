import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { EquipmentEntity } from "./equipment.entity";
import { EquipmentCategoryEntity } from "./equipment-category.entity";

@Entity("equipment_category_items")
export class EquipmentCategoryItemEntity {
  @PrimaryColumn("uuid", { name: "equipment_id" })
  equipment_id: string;

  @PrimaryColumn("uuid", { name: "category_id" })
  category_id: string;

  @ManyToOne(() => EquipmentEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "equipment_id" })
  equipment: EquipmentEntity;

  @ManyToOne(() => EquipmentCategoryEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "category_id" })
  category: EquipmentCategoryEntity;
}
