import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { CompSourceEntity } from './comp-source.entity';
import { ClassEntity } from './class.entity';
import { SubclassEntity } from './subclass.entity';
import { LevelFeatureEntity } from './level-feature.entity';

@Entity('levels')
export class LevelEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  slug: string;

  @Column({ type: 'int' })
  level: number;

  @Column({ type: 'text', nullable: true })
  url?: string;

  @Column({ type: 'int', default: 0 })
  ability_score_bonuses: number;

  @Column({ type: 'int', nullable: true })
  prof_bonus?: number;

  @Column({ type: 'jsonb', nullable: true })
  spellcasting?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  class_specific?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  subclass_specific?: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  class_id?: string;

  @ManyToOne(() => ClassEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'class_id' })
  class?: ClassEntity;

  @Column({ type: 'uuid', nullable: true })
  subclass_id?: string;

  @ManyToOne(() => SubclassEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'subclass_id' })
  subclass?: SubclassEntity;

  @Column({ type: 'uuid', nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: 'source_id' })
  source?: CompSourceEntity;

  @Column({ type: 'jsonb', nullable: true })
  raw?: Record<string, unknown>;

  @OneToMany(() => LevelFeatureEntity, (item) => item.level)
  level_features?: LevelFeatureEntity[];

  @Column({ type: 'timestamptz', default: () => 'now()' })
  created_at: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updated_at: Date;
}
