import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserEntity } from "./user.entity";
import { CharacterClassEntity } from "./character-class.entity";
import { CharacterAbilityScoreEntity } from "./character-ability-score.entity";
import { CharacterSkillEntity } from "./character-skill.entity";
import { CharacterProficiencyEntity } from "./character-proficiency.entity";
import { CharacterSpellEntity } from "./character-spell.entity";
import { CharacterEquipmentEntity } from "./character-equipment.entity";
import { CharacterMagicItemEntity } from "./character-magic-item.entity";
import { CharacterStateEntity } from "./character-state.entity";
import { CharacterLevelUpEntity } from "./character-level-up.entity";
import { CharacterFeatureEntity } from "./character-feature.entity";
import { CharacterOriginEntity } from "./character-origin.entity";
import { CompSourceEntity } from "./comp-source.entity";
import { CompanionTemplateEntity } from "./companion-template.entity";

export type CharacterOwnerType = "pc" | "companion";

@Entity("characters")
export class CharacterEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar" })
  name: string;


  @Column({ type: "jsonb", nullable: true })
  data?: Record<string, unknown>;

  @ManyToOne(() => UserEntity, (user) => user.characters, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Index()
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @Index()
  @Column({ name: "owner_type", type: "varchar", length: 16, default: "pc" })
  ownerType: CharacterOwnerType;

  @ManyToOne(() => CompanionTemplateEntity, {
    nullable: true,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "companion_template_id" })
  companionTemplate?: CompanionTemplateEntity | null;

  @Index()
  @Column({ name: "companion_template_id", type: "uuid", nullable: true })
  companionTemplateId?: string | null;

  @ManyToOne(() => CompSourceEntity, { nullable: true, eager: true })
  @JoinColumn({ name: "source_id" })
  source?: CompSourceEntity;

  @Column({ name: "source_id", type: "uuid", nullable: true })
  sourceId?: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;

  @OneToMany(() => CharacterClassEntity, (cc) => cc.character)
  character_classes?: CharacterClassEntity[];

  @OneToMany(() => CharacterAbilityScoreEntity, (cas) => cas.character)
  character_ability_scores?: CharacterAbilityScoreEntity[];

  @OneToMany(() => CharacterSkillEntity, (cs) => cs.character)
  character_skills?: CharacterSkillEntity[];

  @OneToMany(() => CharacterProficiencyEntity, (cp) => cp.character)
  character_proficiencies?: CharacterProficiencyEntity[];

  @OneToMany(() => CharacterSpellEntity, (cs) => cs.character)
  character_spells?: CharacterSpellEntity[];

  @OneToMany(() => CharacterEquipmentEntity, (ce) => ce.character)
  character_equipment?: CharacterEquipmentEntity[];

  @OneToMany(() => CharacterMagicItemEntity, (cmi) => cmi.character)
  character_magic_items?: CharacterMagicItemEntity[];

  @OneToOne(() => CharacterStateEntity, (s) => s.character)
  character_state?: CharacterStateEntity;

  @OneToMany(() => CharacterLevelUpEntity, (lu) => lu.character)
  character_level_ups?: CharacterLevelUpEntity[];

  @OneToMany(() => CharacterFeatureEntity, (cf) => cf.character)
  character_features?: CharacterFeatureEntity[];

  @OneToOne(() => CharacterOriginEntity, (co) => co.character)
  character_origin?: CharacterOriginEntity;
}
