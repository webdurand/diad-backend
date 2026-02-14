import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CompSourceEntity } from './comp-source.entity';
import { FeatTypeEnum } from './enums';

@Entity('feats')
export class FeatEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: FeatTypeEnum,
    enumName: 'feat_type_enum',
    default: FeatTypeEnum.General,
  })
  feat_type: FeatTypeEnum;

  @Column({ type: 'text', nullable: true })
  repeatable?: string;

  @Column({ type: 'jsonb', nullable: true })
  prerequisites?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  prerequisite_options?: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: 'source_id' })
  source?: CompSourceEntity;

  @Column({ type: 'jsonb', nullable: true })
  raw?: Record<string, unknown>;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  created_at: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updated_at: Date;
}
