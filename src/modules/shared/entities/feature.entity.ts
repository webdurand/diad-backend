import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Feature } from '../interfaces/feature.interface';
import { ClassEntity } from './class.entity';
import { SubclassEntity } from './subclass.entity';

@Entity('features')
export class FeatureEntity implements Feature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  index: string;

  @Column()
  name: string;

  @Column()
  level: number;

  @ManyToOne(() => ClassEntity)
  @JoinColumn({ name: 'class_id' })
  class: ClassEntity;

  @Column({ type: 'jsonb' })
  desc: string[];

  @Column({ type: 'jsonb' })
  prerequisites: Feature['prerequisites'];

  @ManyToOne(() => SubclassEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'subclass_id' })
  subclass?: SubclassEntity; // SubclassEntity agora está alinhada com a interface

  @ManyToOne(() => FeatureEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'parent_id' })
  parent?: FeatureEntity;

  @Column({ nullable: true })
  reference?: string;

  @Column({ type: 'jsonb', nullable: true })
  feature_specific?: Feature['feature_specific'];
}
