import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { Level } from '../interfaces/level.interface';

@Entity('levels')
export class LevelEntity implements Level {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column()
  index: string;

  @Column({ type: 'int' })
  level: number;

  @Column()
  url: string;

  @Column({ name: 'ability_score_bonuses', type: 'int', default: 0 })
  abilityScoreBonuses: number;

  @Column({ name: 'prof_bonus', type: 'int', nullable: true })
  profBonus: number;

  // Armazena o array de referências de features como JSON
  @Column({ type: 'json' })
  features: Level['features'];

  // Objeto simples de classe (futuro relacionamento ManyToOne)
  @Column({ type: 'json' })
  class: Level['class'];

  // Subclasse opcional
  @Column({ type: 'json', nullable: true })
  subclass: Level['subclass'];
  // Dicionário de magias (ex: spell_slots_level_1: 2)
  @Column({ type: 'json', nullable: true })
  spellcasting: Level['spellcasting'];

  // Campos específicos de classe que variam muito
  @Column({ name: 'class_specific', type: 'json', nullable: true })
  classSpecific: Level['class_specific'];

  @Column({ name: 'subclass_specific', type: 'json', nullable: true })
  subclassSpecific: Level['subclass_specific'];
}
