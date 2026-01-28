import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Level } from '../interfaces/level.interface';
import { FeatureEntity } from './feature.entity';
import { ClassEntity } from './class.entity';
import { SubclassEntity } from './subclass.entity';

@Entity('levels')
export class LevelEntity implements Level {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  index: string;

  @Column({ type: 'int' })
  level: number;

  @Column()
  url: string;

  @Column({ name: 'ability_score_bonuses', type: 'int', default: 0 })
  ability_score_bonuses: number;

  @Column({ name: 'prof_bonus', type: 'int', nullable: true })
  prof_bonus: number;

  @ManyToMany(() => FeatureEntity)
  @JoinTable({ name: 'level_features' })
  features: FeatureEntity[];

  @ManyToOne(() => ClassEntity)
  class: ClassEntity;

  @ManyToOne(() => SubclassEntity, { nullable: true, eager: true })
  subclass?: SubclassEntity;

  @Column({ type: 'json', nullable: true })
  spellcasting?: Level['spellcasting'];

  @Column({ name: 'class_specific', type: 'json', nullable: true })
  class_specific?: Level['class_specific'];

  @Column({ name: 'subclass_specific', type: 'json', nullable: true })
  subclass_specific?: Level['subclass_specific'];
}
