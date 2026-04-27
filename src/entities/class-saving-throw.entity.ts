import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { ClassEntity } from "./class.entity";
import { AbilityScoreEntity } from "./ability-score.entity";

@Entity("class_saving_throws")
export class ClassSavingThrowEntity {
  @PrimaryColumn("uuid", { name: "class_id" })
  class_id: string;

  @PrimaryColumn("uuid", { name: "ability_score_id" })
  ability_score_id: string;

  @ManyToOne(() => ClassEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "class_id" })
  class: ClassEntity;

  @ManyToOne(() => AbilityScoreEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ability_score_id" })
  ability_score: AbilityScoreEntity;
}
