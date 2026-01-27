import { AbilityScore } from './ability-score.interface';
import { APIReference } from './api-reference.interface';
import { Feat } from './feat.interface';
import { Proficiency } from './proficiency.interface';

export interface Background {
  id: string;
  index: string;
  name: string;
  ability_scores: AbilityScore[];
  feat: Feat;
  proficiencies: Proficiency[];
  equipment_options: EquipmentOptionWrapper[] | EquipmentChoiceGroup;
  proficiency_choices?: ProficiencyChoice[];
}

// --- Estrutura de Equipamento ---

export interface EquipmentOptionWrapper {
  option_type: OptionType;
  choice: EquipmentChoice;
}

export interface EquipmentChoice {
  choose: number;
  type: string;
  from: EquipmentOptionSet;
}

export interface EquipmentOptionSet {
  option_set_type: string;
  options: EquipmentOptionDefinition[];
}

export interface EquipmentOptionDefinition {
  option_type: string;
  items?: EquipmentItem[];
  count?: number;
  unit?: string;
}

export interface EquipmentItem {
  option_type: OptionType;
  count?: number;
  of?: APIReference;
  unit?: string;
  choice?: EquipmentCategoryChoice;
}

export interface EquipmentCategoryChoice {
  choose: number;
  type: string;
  from: EquipmentCategorySet;
}

export interface EquipmentCategorySet {
  option_set_type: string;
  equipment_category: APIReference;
}

// --- Estrutura de Grupo de Escolha (Alternativa para equipment_options) ---

export interface EquipmentChoiceGroup {
  choose: number;
  type: string;
  from: EquipmentGroupOptionSet;
}

export interface EquipmentGroupOptionSet {
  option_set_type: string;
  options: NestedEquipmentItem[];
}

export interface NestedEquipmentItem {
  option_type: string;
  items?: NestedEquipmentItem[];
  count?: number;
  unit?: string;
  of?: APIReference;
}

// --- Proficiências ---

export interface ProficiencyChoice {
  choose: number;
  type: string;
  from: ProficiencyOptionSet;
}

export interface ProficiencyOptionSet {
  option_set_type: string;
  options: ProficiencyChoiceOption[];
}

export interface ProficiencyChoiceOption {
  option_type: string;
  item: APIReference; // Simplificado pois era redundante
}

export enum OptionType {
  Choice = 'choice',
  CountedReference = 'counted_reference',
  Money = 'money',
}
