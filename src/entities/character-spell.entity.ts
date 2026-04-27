import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { CharacterEntity } from "./character.entity";
import { SpellEntity } from "./spell.entity";
import { SpellSourceEnum, SpellStatusEnum } from "./enums";

@Entity("character_spells")
export class CharacterSpellEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  character_id: string;

  @ManyToOne(() => CharacterEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "character_id" })
  character: CharacterEntity;

  @Column({ type: "uuid" })
  spell_id: string;

  @ManyToOne(() => SpellEntity, { eager: true })
  @JoinColumn({ name: "spell_id" })
  spell: SpellEntity;

  @Column({
    type: "enum",
    enum: SpellSourceEnum,
    enumName: "spell_source_enum",
  })
  source: SpellSourceEnum;

  @Column({
    type: "enum",
    enum: SpellStatusEnum,
    enumName: "spell_status_enum",
  })
  status: SpellStatusEnum;

  @Column({ type: "boolean", default: false })
  always_prepared: boolean;
}
