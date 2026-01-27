import { APIReference } from './api-reference.interface';

export interface Skill extends APIReference {
  description: string;
  ability_score: AbilityScore;
}

export interface AbilityScore extends APIReference {}
