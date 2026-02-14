import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { TraitEntity } from './trait.entity';
import { ProficiencyEntity } from './proficiency.entity';

@Entity('trait_proficiencies')
export class TraitProficiencyEntity {
  @PrimaryColumn('uuid', { name: 'trait_id' })
  trait_id: string;

  @PrimaryColumn('uuid', { name: 'proficiency_id' })
  proficiency_id: string;

  @ManyToOne(() => TraitEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trait_id' })
  trait: TraitEntity;

  @ManyToOne(() => ProficiencyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proficiency_id' })
  proficiency: ProficiencyEntity;
}
