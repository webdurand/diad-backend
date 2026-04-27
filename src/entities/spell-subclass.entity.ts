import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { SpellEntity } from "./spell.entity";
import { SubclassEntity } from "./subclass.entity";

@Entity("spell_subclasses")
export class SpellSubclassEntity {
  @PrimaryColumn("uuid", { name: "spell_id" })
  spell_id: string;

  @PrimaryColumn("uuid", { name: "subclass_id" })
  subclass_id: string;

  @ManyToOne(() => SpellEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "spell_id" })
  spell: SpellEntity;

  @ManyToOne(() => SubclassEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "subclass_id" })
  subclass: SubclassEntity;
}
