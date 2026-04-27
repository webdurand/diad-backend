import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { CompSourceEntity } from "./comp-source.entity";
import { ProficiencyTypeEnum } from "./enums";

@Entity("proficiencies")
export class ProficiencyEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({
    type: "enum",
    enum: ProficiencyTypeEnum,
    enumName: "proficiency_type_enum",
  })
  proficiency_type: ProficiencyTypeEnum;

  @Column({ type: "jsonb" })
  reference: Record<string, unknown>;

  @Column({ type: "uuid", nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: "source_id" })
  source?: CompSourceEntity;

  @Column({ type: "jsonb", nullable: true })
  raw?: Record<string, unknown>;

  @Column({ type: "timestamptz", default: () => "now()" })
  created_at: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updated_at: Date;
}
