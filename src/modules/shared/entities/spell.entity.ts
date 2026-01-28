import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import {
  AreaOfEffect,
  AttackType,
  Component,
  Damage,
  Dc,
  Spell,
} from '../interfaces/spell.interface';
import { MagicSchoolEntity } from './magic-school.entity';
import { ClassEntity } from './class.entity';
import { SubclassEntity } from './subclass.entity';

@Entity('spells')
export class SpellEntity implements Spell {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column({ type: 'text', array: true })
  desc: string[];

  @Column({ type: 'text', array: true, nullable: true })
  higher_level?: string[];

  @Column()
  range: string;

  @Column({ type: 'jsonb' })
  components: Component[];

  @Column({ nullable: true })
  material?: string;

  @Column()
  ritual: boolean;

  @Column()
  duration: string;

  @Column()
  concentration: boolean;

  @Column()
  casting_time: string;

  @Column()
  level: number;

  @Column({ type: 'enum', enum: AttackType, nullable: true })
  attack_type?: AttackType;

  @Column({ type: 'jsonb', nullable: true })
  damage?: Damage;

  @ManyToOne(() => MagicSchoolEntity)
  school: MagicSchoolEntity;

  @ManyToMany(() => ClassEntity)
  @JoinTable()
  classes: ClassEntity[];

  @ManyToMany(() => SubclassEntity)
  @JoinTable()
  subclasses: SubclassEntity[];

  @Column()
  url: string;

  @Column({ type: 'jsonb', nullable: true })
  dc?: Dc;

  @Column({ type: 'jsonb', nullable: true })
  heal_at_slot_level?: { [key: string]: string };

  @Column({ type: 'jsonb', nullable: true })
  area_of_effect?: AreaOfEffect;
}
