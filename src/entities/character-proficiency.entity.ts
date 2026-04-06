import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CharacterEntity } from './character.entity';
import { ProficiencyEntity } from './proficiency.entity';
import { CharacterProficiencySourceEnum } from './enums';

@Entity('character_proficiencies')
export class CharacterProficiencyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  character_id: string;

  @ManyToOne(() => CharacterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: CharacterEntity;

  @Column({ type: 'uuid' })
  proficiency_id: string;

  @ManyToOne(() => ProficiencyEntity, { eager: true })
  @JoinColumn({ name: 'proficiency_id' })
  proficiency: ProficiencyEntity;

  @Column({
    type: 'enum',
    enum: CharacterProficiencySourceEnum,
    enumName: 'character_proficiency_source_enum',
  })
  source: CharacterProficiencySourceEnum;
}
