import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';
import { Class } from '../interfaces/class.interface';
import { ProficiencyEntity } from './proficiency.entity';
import { EquipmentEntity } from './equipment.entity';
import { SubclassEntity } from './subclass.entity';

@Entity('classes')
export class ClassEntity implements Class {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column()
  hit_die: number;

  @Column({ type: 'jsonb' })
  proficiency_choices: Class['proficiency_choices'];

  @ManyToMany(() => ProficiencyEntity)
  @JoinTable()
  proficiencies: ProficiencyEntity[];

  @ManyToMany(() => ProficiencyEntity)
  @JoinTable()
  saving_throws: ProficiencyEntity[];

  @ManyToMany(() => EquipmentEntity)
  @JoinTable()
  starting_equipment: EquipmentEntity[];

  @Column({ type: 'jsonb', nullable: true })
  starting_equipment_options: Class['starting_equipment_options'];

  @Column()
  class_levels: string;

  @Column({ type: 'jsonb' })
  multi_classing: Class['multi_classing'];

  @OneToMany(() => SubclassEntity, (subclass) => subclass.class)
  subclasses: SubclassEntity[];

  @Column({ type: 'jsonb', nullable: true })
  spellcasting?: Class['spellcasting'];

  @Column({ nullable: true })
  spells?: string;
}
