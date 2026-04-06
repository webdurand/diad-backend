import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CharacterEntity } from './character.entity';
import { FeatureEntity } from './feature.entity';
import { ClassEntity } from './class.entity';

@Entity('character_features')
export class CharacterFeatureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  character_id: string;

  @ManyToOne(() => CharacterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: CharacterEntity;

  @Column({ type: 'uuid' })
  feature_id: string;

  @ManyToOne(() => FeatureEntity, { eager: true })
  @JoinColumn({ name: 'feature_id' })
  feature: FeatureEntity;

  @Column({ type: 'uuid', nullable: true })
  source_class_id?: string;

  @ManyToOne(() => ClassEntity, { nullable: true })
  @JoinColumn({ name: 'source_class_id' })
  source_class?: ClassEntity;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'jsonb', default: {} })
  choices: Record<string, unknown>;
}
