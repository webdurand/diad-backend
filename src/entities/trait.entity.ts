import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { CompSourceEntity } from './comp-source.entity';
import { TraitProficiencyEntity } from './trait-proficiency.entity';

@Entity('traits')
export class TraitEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'text', array: true })
  description: string[];

  @Column({
    type: 'text',
    generatedType: 'STORED',
    asExpression: "immutable_array_to_string(description, ' ')",
  })
  search_text: string;

  @Column({ type: 'jsonb', nullable: true })
  proficiency_choices?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  trait_specific?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  language_options?: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  parent_id?: string;

  @ManyToOne(() => TraitEntity, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent?: TraitEntity;

  @Column({ type: 'uuid', nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: 'source_id' })
  source?: CompSourceEntity;

  @Column({ type: 'jsonb', nullable: true })
  raw?: Record<string, unknown>;

  @OneToMany(() => TraitProficiencyEntity, (item) => item.trait)
  trait_proficiencies?: TraitProficiencyEntity[];

  @Column({ type: 'timestamptz', default: () => 'now()' })
  created_at: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updated_at: Date;
}
