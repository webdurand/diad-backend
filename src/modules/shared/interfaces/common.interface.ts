import { AbilityScore } from './ability-score.interface';

export interface Dc {
  dc_type: AbilityScore;
  dc_value?: number;
  success_type: string;
}
