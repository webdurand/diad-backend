import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { LevelEntity } from './level.entity';
import { FeatureEntity } from './feature.entity';

@Entity('level_features')
export class LevelFeatureEntity {
  @PrimaryColumn('uuid', { name: 'level_id' })
  level_id: string;

  @PrimaryColumn('uuid', { name: 'feature_id' })
  feature_id: string;

  @ManyToOne(() => LevelEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'level_id' })
  level: LevelEntity;

  @ManyToOne(() => FeatureEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feature_id' })
  feature: FeatureEntity;
}