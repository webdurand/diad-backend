import { APIReference } from './api-reference.interface';

export enum OptionSetType {
  OptionsArray = 'options_array',
}

export enum OptionType {
  Choice = 'choice',
  Multiple = 'multiple',
  Reference = 'reference',
}

export enum SubfeatureOptionsType {
  Feature = 'feature',
  Proficiency = 'proficiency',
}

export enum PrerequisiteType {
  Feature = 'feature',
  Level = 'level',
  Spell = 'spell',
}

export interface Prerequisite {
  type: PrerequisiteType;
  spell?: string;
  feature?: string;
  level?: number;
}

export interface FeatureOption {
  option_type: OptionType;
  item?: APIReference;
  choice?: SubfeatureOptions;
  items?: FeatureOption[];
}

export interface SubfeatureOptions {
  choose: number;
  type: SubfeatureOptionsType;
  from: {
    option_set_type: OptionSetType;
    options: FeatureOption[];
  };
}

export interface TypeOptions {
  desc: string;
  choose: number;
  type: string;
  from: {
    option_set_type: OptionSetType;
    options: string[];
  };
}

export interface FeatureSpecific {
  expertise_options?: SubfeatureOptions; // Reaproveitando a estrutura de escolha
  subfeature_options?: SubfeatureOptions;
  enemy_type_options?: TypeOptions;
  terrain_type_options?: TypeOptions;
  invocations?: APIReference[];
}

export interface Feature extends APIReference {
  class: APIReference;
  level: number;
  prerequisites: Prerequisite[];
  desc: string[];
  subclass?: APIReference;
  reference?: string;
  feature_specific?: FeatureSpecific;
  parent?: APIReference;
}
