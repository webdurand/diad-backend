import { APIReference } from './api-reference.interface';
export interface Race extends APIReference {
  speed: number;
  ability_bonuses: AbilityBonus[];
  alignment: string;
  age: string;
  size: string;
  size_description: string;
  languages: APIReference[];
  language_desc: string;
  traits: APIReference[];
  subraces: APIReference[];
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
  ability_score: APIReference;
  bonus: number;
}

export interface Language extends APIReference {}

export interface AbilityBonus {
  ability_score: APIReference;
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
  item: APIReference;
}

export enum OptionType {
  Reference = 'reference',
}
