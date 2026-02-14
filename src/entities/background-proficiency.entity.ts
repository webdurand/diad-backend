import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BackgroundEntity } from './background.entity';
import { ProficiencyEntity } from './proficiency.entity';

@Entity('background_proficiencies')
export class BackgroundProficiencyEntity {
  @PrimaryColumn('uuid', { name: 'background_id' })
  background_id: string;

  @PrimaryColumn('uuid', { name: 'proficiency_id' })
  proficiency_id: string;

  @ManyToOne(() => BackgroundEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'background_id' })
  background: BackgroundEntity;

  @ManyToOne(() => ProficiencyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proficiency_id' })
  proficiency: ProficiencyEntity;
}
