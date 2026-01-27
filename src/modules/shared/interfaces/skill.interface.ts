import { AbilityScore } from './ability-score.interface';

export interface Skill {
  id: string;
  name: string;
  description: string;
  ability_score: AbilityScore;
}
