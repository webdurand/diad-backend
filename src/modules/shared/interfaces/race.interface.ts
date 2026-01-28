import { AbilityScore } from './ability-score.interface';
import { Language } from './language.interface';
import { Subrace } from './subrace.interface';
import { Trait } from './trait.interface';
export interface Race {
  id: string;
  index: string;
  name: string;
  speed: number;
  ability_bonuses: AbilityBonus[];
  alignment: string;
  age: string;
  size: string;
  size_description: string;
  languages: Language[];
  language_desc: string;
  traits: Trait[];
  subraces: Subrace[];
  language_options?: LanguageOptions;
  ability_bonus_options?: AbilityBonusOptions;
}

export interface AbilityBonusOptions {
  choose: number;
  type: string;
  from: AbilityBonusOptionsFrom;
}

export interface AbilityBonusOptionsFrom {
  option_set_type: string;
  options: AbilityBonusOption[];
}

export interface AbilityBonusOption {
  option_type: string;
  ability_score: AbilityScore;
  bonus: number;
}

export interface AbilityBonus {
  ability_score: AbilityScore;
  bonus: number;
}

export interface LanguageOptions {
  choose: number;
  type: string;
  from: LanguageOptionsFrom;
}

export interface LanguageOptionsFrom {
  option_set_type: string;
  options: LanguageOption[];
}

export interface LanguageOption {
  option_type: OptionType;
  item: Language;
}

export enum OptionType {
  Reference = 'reference',
}
