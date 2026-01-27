import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Feature } from '../interfaces/feature.interface';

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

  @Column({ type: 'jsonb' })
  class: Feature['class'];

  @Column({ type: 'jsonb' })
  desc: string[];

  @Column({ type: 'jsonb' })
  prerequisites: Feature['prerequisites'];

  @Column({ type: 'jsonb', nullable: true })
  subclass?: Feature['subclass'];

  @Column({ type: 'jsonb', nullable: true })
  parent?: Feature['parent'];

  @Column({ nullable: true })
  reference?: string;

  @Column({ type: 'jsonb', nullable: true })
  feature_specific?: Feature['feature_specific'];

  @Column()
  url: string;
}
