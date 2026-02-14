import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SubraceEntity } from './subrace.entity';
import { TraitEntity } from './trait.entity';

@Entity('subrace_traits')
export class SubraceTraitEntity {
  @PrimaryColumn('uuid', { name: 'subrace_id' })
  subrace_id: string;

  @PrimaryColumn('uuid', { name: 'trait_id' })
  trait_id: string;

  @ManyToOne(() => SubraceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subrace_id' })
  subrace: SubraceEntity;

  @ManyToOne(() => TraitEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trait_id' })
  trait: TraitEntity;
}