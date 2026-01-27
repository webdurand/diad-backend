import { Proficiency } from './proficiency.interface';
import { Equipment } from './equipment.interface';
import { Subclass } from './subclass.interface';

export interface Class {
  id: string;
  index: string;
  name: string;
  hit_die: number;
  proficiency_choices: ProficiencyChoice[];
  proficiencies: Proficiency[];
  saving_throws: Proficiency[];
  starting_equipment: Equipment[];
  starting_equipment_options: StartingEquipmentOption[];
  class_levels: string;
  multi_classing: MultiClassing;
  subclasses: Subclass[];
  spellcasting?: Spellcasting;
  spells?: string;
}

// --- MULTICLASSING ---

export interface MultiClassing {
  prerequisites?: MultiClassingPrerequisite[];
  proficiencies: Proficiency[];
  proficiency_choices?: MultiClassProficiencyChoice[];
  prerequisite_options?: PrerequisiteOptions;
}

export interface MultiClassingPrerequisite {
  ability_score: Proficiency;
  minimum_score: number;
}

export interface PrerequisiteOptions {
  type: string;
  choose: number;
  from: PrerequisiteOptionSet;
}

export interface PrerequisiteOptionSet {
  option_set_type: OptionSetType;
  options: AbilityScorePrerequisiteOption[];
}

export interface AbilityScorePrerequisiteOption {
  option_type: string;
  ability_score: Proficiency;
  minimum_score: number;
}

// --- PROFICIENCIES ---

export interface MultiClassProficiencyChoice {
  desc?: string;
  choose: number;
  type: ProficiencyChoiceType;
  from: ProficiencyOptionSet;
}

export interface ProficiencyOptionSet {
  option_set_type: OptionSetType;
  options: ProficiencyOption[];
}

export interface ProficiencyOption {
  option_type: OptionReferenceType;
  item: Proficiency;
}

export interface ProficiencyChoice {
  desc: string;
  choose: number;
  type: ProficiencyChoiceType;
  from: ClassProficiencyOptionSet;
}

export interface ClassProficiencyOptionSet {
  option_set_type: OptionSetType;
  options: ProficiencyChoiceOption[];
}

export interface ProficiencyChoiceOption {
  option_type: OptionReferenceType;
  item?: Proficiency;
  choice?: MultiClassProficiencyChoice;
}

// --- EQUIPMENT ---

export interface StartingEquipment {
  equipment: Proficiency;
  quantity: number;
}

export interface StartingEquipmentOption {
  desc: string;
  choose: number;
  type: StartingEquipmentOptionType;
  from: StartingEquipmentOptionSet;
}

export interface StartingEquipmentOptionSet {
  option_set_type: OptionSetType;
  options?: EquipmentOption[];
  equipment_category?: Proficiency;
}

export interface EquipmentOption {
  option_type: ItemOptionType;
  count?: number;
  of?: Proficiency;
  choice?: EquipmentCategoryChoice;
  prerequisites?: OptionPrerequisite[];
  items?: Item[];
}

export interface EquipmentCategoryChoice {
  desc: string;
  choose: number;
  type: StartingEquipmentOptionType;
  from: EquipmentCategoryOptionSet;
}

export interface EquipmentCategoryOptionSet {
  option_set_type: OptionSetType;
  equipment_category: Proficiency;
}

export interface Item {
  option_type: ItemOptionType;
  count?: number;
  of?: Proficiency;
  choice?: EquipmentCategoryChoice;
}

// --- SPELLCASTING & MISC ---

export interface Spellcasting {
  level: number;
  spellcasting_ability: Proficiency;
  info: SpellcastingInfo[];
}

export interface SpellcastingInfo {
  name: string;
  desc: string[];
}

export interface OptionPrerequisite {
  type: string;
  proficiency: Proficiency;
}

// --- ENUMS ---

export enum OptionSetType {
  EquipmentCategory = 'equipment_category',
  OptionsArray = 'options_array',
}

export enum OptionReferenceType {
  Choice = 'choice',
  Reference = 'reference',
}

export enum ProficiencyChoiceType {
  Proficiencies = 'proficiencies',
}

export enum StartingEquipmentOptionType {
  Equipment = 'equipment',
}

export enum ItemOptionType {
  Choice = 'choice',
  CountedReference = 'counted_reference',
  Multiple = 'multiple',
}
