import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CompSourceEntity } from './comp-source.entity';
import { ClassEntity } from './class.entity';

@Entity('subclasses')
export class SubclassEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  subclass_flavor: string;

  @Column({ type: 'text', array: true })
  description: string[];

  @Column({
    type: 'text',
    generatedType: 'STORED',
    asExpression: "immutable_array_to_string(description, ' ')",
  })
  search_text: string;

  @Column({ type: 'text', nullable: true })
  subclass_levels_url?: string;

  @Column({ type: 'jsonb', nullable: true })
  spells?: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  class_id?: string;

  @ManyToOne(() => ClassEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'class_id' })
  class?: ClassEntity;

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
