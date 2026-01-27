import { APIReference } from './api-reference.interface';

export interface Subrace extends APIReference {
  race: Race;
  desc: string;
  ability_bonuses: AbilityBonus[];
  racial_traits: Race[];
}

export interface AbilityBonus {
  ability_score: Race;
  bonus: number;
}

export interface Race extends APIReference {}
