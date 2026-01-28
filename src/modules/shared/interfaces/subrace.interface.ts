import { AbilityScore } from './ability-score.interface';
import { Race } from './race.interface';
import { Trait } from './trait.interface';

export interface Subrace {
  id: string;
  index: string;
  name: string;
  race: Race;
  desc: string;
  ability_bonuses: AbilityBonus[];
  racial_traits: Trait[];
}

export interface AbilityBonus {
  ability_score: AbilityScore;
  bonus: number;
}
