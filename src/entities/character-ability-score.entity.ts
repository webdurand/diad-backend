import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { CharacterEntity } from "./character.entity";
import { AbilityScoreEntity } from "./ability-score.entity";

@Entity("character_ability_scores")
export class CharacterAbilityScoreEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  character_id: string;

  @ManyToOne(() => CharacterEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "character_id" })
  character: CharacterEntity;

  @Column({ type: "uuid" })
  ability_score_id: string;

  @ManyToOne(() => AbilityScoreEntity, { eager: true })
  @JoinColumn({ name: "ability_score_id" })
  ability_score: AbilityScoreEntity;

  @Column({ type: "int" })
  base_score: number;

  @Column({ type: "int", default: 0 })
  bonus: number;
}
