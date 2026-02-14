import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { CompSourceEntity } from './comp-source.entity';
import { SubclassEntity } from './subclass.entity';
import { ClassProficiencyEntity } from './class-proficiency.entity';
import { ClassSavingThrowEntity } from './class-saving-throw.entity';
import { ClassStartingEquipmentEntity } from './class-starting-equipment.entity';

@Entity('classes')
export class ClassEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'int' })
  hit_die: number;

  @Column({ type: 'jsonb' })
  proficiency_choices: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  starting_equipment_options?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  class_levels_url?: string;

  @Column({ type: 'jsonb' })
  multi_classing: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  spellcasting?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  spells_url?: string;

  @Column({ type: 'uuid', nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: 'source_id' })
  source?: CompSourceEntity;

  @Column({ type: 'jsonb', nullable: true })
  raw?: Record<string, unknown>;

  @OneToMany(() => SubclassEntity, (subclass) => subclass.class)
  subclasses?: SubclassEntity[];

  @OneToMany(() => ClassProficiencyEntity, (item) => item.class)
  class_proficiencies?: ClassProficiencyEntity[];

  @OneToMany(() => ClassSavingThrowEntity, (item) => item.class)
  class_saving_throws?: ClassSavingThrowEntity[];

  @OneToMany(() => ClassStartingEquipmentEntity, (item) => item.class)
  class_starting_equipment?: ClassStartingEquipmentEntity[];

  @Column({ type: 'timestamptz', default: () => 'now()' })
  created_at: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updated_at: Date;
}
