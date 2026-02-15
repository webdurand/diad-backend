import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CharacterEntity } from './character.entity';
import { RaceEntity } from './race.entity';
import { SubraceEntity } from './subrace.entity';
import { BackgroundEntity } from './background.entity';
import { AlignmentEntity } from './alignment.entity';

@Entity('character_origins')
export class CharacterOriginEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  character_id: string;

  @OneToOne(() => CharacterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: CharacterEntity;

  @Column({ type: 'uuid' })
  race_id: string;

  @ManyToOne(() => RaceEntity, { eager: true })
  @JoinColumn({ name: 'race_id' })
  race: RaceEntity;

  @Column({ type: 'uuid', nullable: true })
  subrace_id?: string;

  @ManyToOne(() => SubraceEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'subrace_id' })
  subrace?: SubraceEntity;

  @Column({ type: 'uuid' })
  background_id: string;

  @ManyToOne(() => BackgroundEntity, { eager: true })
  @JoinColumn({ name: 'background_id' })
  background: BackgroundEntity;

  @Column({ type: 'uuid', nullable: true })
  alignment_id?: string;

  @ManyToOne(() => AlignmentEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'alignment_id' })
  alignment?: AlignmentEntity;

  @Column({ type: 'jsonb', default: {} })
  personality: Record<string, string>;

  @Column({ type: 'varchar', nullable: true })
  species_size?: string;

  @Column({ type: 'varchar', nullable: true })
  species_spellcasting_ability?: string;

  @Column({ type: 'varchar', nullable: true })
  age?: string;

  @Column({ type: 'varchar', nullable: true })
  height?: string;

  @Column({ type: 'varchar', nullable: true })
  weight?: string;

  @Column({ type: 'varchar', nullable: true })
  ability_score_method?: string;

  @Column({ type: 'jsonb', default: [] })
  race_trait_choices: string[];

  @Column({ type: 'varchar', nullable: true })
  race_feat_choice?: string;

  @Column({ type: 'varchar', nullable: true })
  divine_order?: string;

  @Column({ type: 'varchar', nullable: true })
  primal_order?: string;

  @Column({ type: 'varchar', nullable: true })
  fighting_style_index?: string;

  @Column({ type: 'jsonb', default: [] })
  class_equipment_choices: string[];

  @Column({ type: 'jsonb', default: [] })
  background_equipment_choices: string[];

  @Column({ type: 'jsonb', nullable: true })
  class_starting_gold?: Record<string, unknown>;

  @Column({ type: 'jsonb', default: [] })
  eldritch_invocations: string[];

  @Column({ type: 'jsonb', nullable: true })
  eldritch_invocation_sub_choices?: Record<string, unknown>;

  @Column({ type: 'jsonb', default: [] })
  weapon_mastery_choices: string[];

  @Column({ type: 'jsonb', default: [] })
  class_language_choices: string[];

  @Column({ type: 'varchar', nullable: true })
  class_tool_proficiency?: string;
}
