import { APIReference } from './api-reference.interface';

export interface FeatPrerequisites {
  minimum_level?: number;
  feature_named?: string;
}

export interface FeatPrerequisiteOption {
  option_type: string;
  ability_score: APIReference;
  minimum_score: number;
}

export interface Feat extends APIReference {
  description: string;
  type: 'origin' | 'general' | 'fighting-style' | 'epic-boon';
  repeatable?: string;
  prerequisites?: FeatPrerequisites;
  prerequisite_options?: {
    type: string;
    choose: number;
    from: {
      option_set_type: string;
      options: FeatPrerequisiteOption[];
    };
  };
}
