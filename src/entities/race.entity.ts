import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { CompSourceEntity } from "./comp-source.entity";
import { RaceLanguageEntity } from "./race-language.entity";
import { RaceTraitEntity } from "./race-trait.entity";
import { SubraceEntity } from "./subrace.entity";

@Entity("races")
export class RaceEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: "int" })
  speed: number;

  @Column({ type: "jsonb" })
  ability_bonuses: Record<string, unknown>;

  @Column({ type: "text" })
  age: string;

  @Column({ type: "text" })
  size: string;

  @Column({ type: "text" })
  size_description: string;

  @Column({ type: "jsonb", nullable: true })
  language_options?: Record<string, unknown>;

  @Column({ type: "text" })
  language_desc: string;

  @Column({ type: "jsonb", nullable: true })
  ability_bonus_options?: Record<string, unknown>;

  @Column({ type: "text" })
  alignment: string;

  @Column({ type: "uuid", nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: "source_id" })
  source?: CompSourceEntity;

  @Column({ type: "jsonb", nullable: true })
  raw?: Record<string, unknown>;

  @OneToMany(() => RaceLanguageEntity, (item) => item.race)
  race_languages?: RaceLanguageEntity[];

  @OneToMany(() => RaceTraitEntity, (item) => item.race)
  race_traits?: RaceTraitEntity[];

  @OneToMany(() => SubraceEntity, (item) => item.race)
  subraces?: SubraceEntity[];

  @Column({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
