import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { RaceEntity } from "./race.entity";
import { LanguageEntity } from "./language.entity";

@Entity("race_languages")
export class RaceLanguageEntity {
  @PrimaryColumn("uuid", { name: "race_id" })
  race_id: string;

  @PrimaryColumn("uuid", { name: "language_id" })
  language_id: string;

  @ManyToOne(() => RaceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "race_id" })
  race: RaceEntity;

  @ManyToOne(() => LanguageEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "language_id" })
  language: LanguageEntity;
}
