import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { CompSourceEntity } from "./comp-source.entity";
import { MagicSchoolEntity } from "./magic-school.entity";
import { SpellClassEntity } from "./spell-class.entity";
import { SpellSubclassEntity } from "./spell-subclass.entity";
import { AttackTypeEnum } from "./enums";

@Entity("spells")
export class SpellEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: "text", array: true })
  description: string[];

  @Column({ type: "text", array: true, nullable: true })
  higher_level?: string[];

  @Column({
    type: "text",
    generatedType: "STORED",
    asExpression:
      "immutable_array_to_string(description || COALESCE(higher_level, ARRAY[]::text[]), ' ')",
  })
  search_text: string;

  @Column({ type: "text" })
  range: string;

  @Column({ type: "jsonb" })
  components: Record<string, unknown>;

  @Column({ type: "text", nullable: true })
  material?: string;

  @Column({ type: "boolean" })
  ritual: boolean;

  @Column({ type: "text" })
  duration: string;

  @Column({ type: "boolean" })
  concentration: boolean;

  @Column({ type: "text" })
  casting_time: string;

  @Column({ type: "int" })
  level: number;

  @Column({
    type: "enum",
    enum: AttackTypeEnum,
    enumName: "attack_type_enum",
    nullable: true,
  })
  attack_type?: AttackTypeEnum;

  @Column({ type: "jsonb", nullable: true })
  damage?: Record<string, unknown>;

  @Column({ type: "text", nullable: true })
  url?: string;

  @Column({ type: "jsonb", nullable: true })
  dc?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  heal_at_slot_level?: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  area_of_effect?: Record<string, unknown>;

  @Column({ type: "uuid", nullable: true })
  school_id?: string;

  @ManyToOne(() => MagicSchoolEntity, { nullable: true })
  @JoinColumn({ name: "school_id" })
  school?: MagicSchoolEntity;

  @Column({ type: "uuid", nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: "source_id" })
  source?: CompSourceEntity;

  @Column({ type: "jsonb", nullable: true })
  raw?: Record<string, unknown>;

  @OneToMany(() => SpellClassEntity, (item) => item.spell)
  spell_classes?: SpellClassEntity[];

  @OneToMany(() => SpellSubclassEntity, (item) => item.spell)
  spell_subclasses?: SpellSubclassEntity[];

  @Column({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
