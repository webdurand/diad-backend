export interface Race {
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
  traits: Language[];
  subraces: Language[];
  url: string;
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
  options: PurpleOption[];
}

export interface PurpleOption {
  option_type: string;
  ability_score: Language;
  bonus: number;
}

export interface Language {
  index: string;
  name: string;
  url: string;
}

export interface AbilityBonus {
  ability_score: Language;
  bonus: number;
}

export interface LanguageOptions {
  choose: number;
  type: string;
  from: LanguageOptionsFrom;
}

export interface LanguageOptionsFrom {
  option_set_type: string;
  options: FluffyOption[];
}

export interface FluffyOption {
  option_type: OptionType;
  item: Language;
}

export enum OptionType {
  Reference = 'reference',
}
