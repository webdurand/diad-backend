import { AbilityScoreEntity } from '../entities/ability-score.entity';
import { AlignmentEntity } from '../entities/alignment.entity';
import { BackgroundEntity } from '../entities/background.entity';
import { ClassEntity } from '../entities/class.entity';
import { ConditionEntity } from '../entities/condition.entity';
import { DamageTypeEntity } from '../entities/damage-type.entity';
import { EquipmentEntity } from '../entities/equipment.entity';
import { EquipmentCategoryEntity } from '../entities/equipment-category.entity';
import { FeatEntity } from '../entities/feat.entity';
import { FeatureEntity } from '../entities/feature.entity';
import { LanguageEntity } from '../entities/language.entity';
import { LevelEntity } from '../entities/level.entity';
import { MagicItemEntity } from '../entities/magic-item.entity';
import { MagicSchoolEntity } from '../entities/magic-school.entity';
import { MonsterEntity } from '../entities/monster.entity';
import { ProficiencyEntity } from '../entities/proficiency.entity';
import { RaceEntity } from '../entities/race.entity';
import { RuleEntity } from '../entities/rule.entity';
import { RuleSectionEntity } from '../entities/rule-section.entity';
import { SkillEntity } from '../entities/skill.entity';
import { SpellEntity } from '../entities/spell.entity';
import { SubclassEntity } from '../entities/subclass.entity';
import { SubraceEntity } from '../entities/subrace.entity';
import { TraitEntity } from '../entities/trait.entity';
import { WeaponMasteryPropertyEntity } from '../entities/weapon-mastery-property.entity';
import { WeaponPropertyEntity } from '../entities/weapon-property.entity';

export enum Entities {
  AbilityScore = 'AbilityScoreEntity',
  Alignment = 'AlignmentEntity',
  Background = 'BackgroundEntity',
  Class = 'ClassEntity',
  Condition = 'ConditionEntity',
  DamageType = 'DamageTypeEntity',
  Equipment = 'EquipmentEntity',
  EquipmentCategory = 'EquipmentCategoryEntity',
  Feat = 'FeatEntity',
  Feature = 'FeatureEntity',
  Language = 'LanguageEntity',
  Level = 'LevelEntity',
  MagicItem = 'MagicItemEntity',
  MagicSchool = 'MagicSchoolEntity',
  Monster = 'MonsterEntity',
  Proficiency = 'ProficiencyEntity',
  Race = 'RaceEntity',
  Rule = 'RuleEntity',
  RuleSection = 'RuleSectionEntity',
  Skill = 'SkillEntity',
  Spell = 'SpellEntity',
  Subclass = 'SubclassEntity',
  Subrace = 'SubraceEntity',
  Trait = 'TraitEntity',
  WeaponMasteryProperty = 'WeaponMasteryPropertyEntity',
  WeaponProperty = 'WeaponPropertyEntity',
}

export const entityMap = {
  [Entities.AbilityScore]: AbilityScoreEntity,
  [Entities.Alignment]: AlignmentEntity,
  [Entities.Background]: BackgroundEntity,
  [Entities.Class]: ClassEntity,
  [Entities.Condition]: ConditionEntity,
  [Entities.DamageType]: DamageTypeEntity,
  [Entities.Equipment]: EquipmentEntity,
  [Entities.EquipmentCategory]: EquipmentCategoryEntity,
  [Entities.Feat]: FeatEntity,
  [Entities.Feature]: FeatureEntity,
  [Entities.Language]: LanguageEntity,
  [Entities.Level]: LevelEntity,
  [Entities.MagicItem]: MagicItemEntity,
  [Entities.MagicSchool]: MagicSchoolEntity,
  [Entities.Monster]: MonsterEntity,
  [Entities.Proficiency]: ProficiencyEntity,
  [Entities.Race]: RaceEntity,
  [Entities.Rule]: RuleEntity,
  [Entities.RuleSection]: RuleSectionEntity,
  [Entities.Skill]: SkillEntity,
  [Entities.Spell]: SpellEntity,
  [Entities.Subclass]: SubclassEntity,
  [Entities.Subrace]: SubraceEntity,
  [Entities.Trait]: TraitEntity,
  [Entities.WeaponMasteryProperty]: WeaponMasteryPropertyEntity,
  [Entities.WeaponProperty]: WeaponPropertyEntity,
};

// Mapeamento de relações que devem ser carregadas para cada entidade
export const entityRelations: Record<string, string[]> = {
  [Entities.Race]: ['languages', 'traits', 'subraces'],
  [Entities.Subrace]: ['race', 'racial_traits'],
  [Entities.Class]: ['proficiencies', 'saving_throws', 'starting_equipment', 'subclasses'],
  [Entities.Subclass]: ['class'],
  [Entities.Spell]: ['classes', 'subclasses', 'school'],
  [Entities.Equipment]: ['equipment_categories'],
  [Entities.Monster]: [],
  [Entities.Feat]: [],
  [Entities.Proficiency]: [],
};
