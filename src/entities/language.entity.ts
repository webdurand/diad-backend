import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CompSourceEntity } from './comp-source.entity';

@Entity('languages')
export class LanguageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'boolean', default: false })
  is_rare: boolean;

  @Column({ type: 'text', nullable: true })
  note?: string;

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
