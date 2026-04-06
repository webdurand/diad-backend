import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CharacterEntity } from './character.entity';
import { SkillEntity } from './skill.entity';

@Entity('character_skills')
export class CharacterSkillEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  character_id: string;

  @ManyToOne(() => CharacterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'character_id' })
  character: CharacterEntity;

  @Column({ type: 'uuid' })
  skill_id: string;

  @ManyToOne(() => SkillEntity, { eager: true })
  @JoinColumn({ name: 'skill_id' })
  skill: SkillEntity;

  @Column({ type: 'boolean', default: false })
  expertise: boolean;
}
