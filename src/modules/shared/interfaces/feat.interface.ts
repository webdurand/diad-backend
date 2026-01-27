import { APIReference } from './api-reference.interface';

// Usamos o seu Enum para garantir que o tipo seja exato
export enum FeatType {
  EpicBoon = 'epic-boon',
  FightingStyle = 'fighting-style',
  General = 'general',
  Origin = 'origin',
}

export interface FeatOption {
  option_type: string;
  ability_score: APIReference;
  minimum_score: number;
}

export interface FeatPrerequisiteOptions {
  type: string;
  choose: number;
  from: {
    option_set_type: string;
    options: FeatOption[];
  };
}

export interface FeatPrerequisites {
  minimum_level?: number;
  feature_named?: string;
}

// Interface principal estendendo a base comum
export interface Feat extends APIReference {
  description: string;
  type: FeatType;
  repeatable?: string;
  prerequisites?: FeatPrerequisites;
  prerequisite_options?: FeatPrerequisiteOptions;
}
