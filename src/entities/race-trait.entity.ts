import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { RaceEntity } from "./race.entity";
import { TraitEntity } from "./trait.entity";

@Entity("race_traits")
export class RaceTraitEntity {
  @PrimaryColumn("uuid", { name: "race_id" })
  race_id: string;

  @PrimaryColumn("uuid", { name: "trait_id" })
  trait_id: string;

  @ManyToOne(() => RaceEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "race_id" })
  race: RaceEntity;

  @ManyToOne(() => TraitEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "trait_id" })
  trait: TraitEntity;
}
