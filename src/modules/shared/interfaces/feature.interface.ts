import { Class } from './class.interface';
import { Proficiency } from './proficiency.interface';
import { Subclass } from './subclass.interface';

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
  item?: Proficiency | Feature;
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
  invocations?: Feature[];
}

export interface Feature {
  id: string;
  index: string;
  name: string;
  class: Class;
  level: number;
  prerequisites: Prerequisite[];
  desc: string[];
  subclass?: Subclass;
  reference?: string;
  feature_specific?: FeatureSpecific;
  parent?: Feature;
}
