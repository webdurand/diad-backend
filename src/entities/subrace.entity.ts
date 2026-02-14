import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { CompSourceEntity } from './comp-source.entity';
import { RaceEntity } from './race.entity';
import { SubraceTraitEntity } from './subrace-trait.entity';

@Entity('subraces')
export class SubraceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb' })
  ability_bonuses: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  url?: string;

  @Column({ type: 'uuid', nullable: true })
  race_id?: string;

  @ManyToOne(() => RaceEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'race_id' })
  race?: RaceEntity;

  @Column({ type: 'uuid', nullable: true })
  source_id?: string;

  @ManyToOne(() => CompSourceEntity, { nullable: true })
  @JoinColumn({ name: 'source_id' })
  source?: CompSourceEntity;

  @Column({ type: 'jsonb', nullable: true })
  raw?: Record<string, unknown>;

  @OneToMany(() => SubraceTraitEntity, (item) => item.subrace)
  subrace_traits?: SubraceTraitEntity[];

  @Column({ type: 'timestamptz', default: () => 'now()' })
  created_at: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updated_at: Date;
}
