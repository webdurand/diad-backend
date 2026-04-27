import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { ClassEntity } from "./class.entity";
import { ProficiencyEntity } from "./proficiency.entity";

@Entity("class_proficiencies")
export class ClassProficiencyEntity {
  @PrimaryColumn("uuid", { name: "class_id" })
  class_id: string;

  @PrimaryColumn("uuid", { name: "proficiency_id" })
  proficiency_id: string;

  @ManyToOne(() => ClassEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "class_id" })
  class: ClassEntity;

  @ManyToOne(() => ProficiencyEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "proficiency_id" })
  proficiency: ProficiencyEntity;
}
