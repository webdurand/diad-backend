import { APIReference } from './api-reference.interface';

export interface Trait extends APIReference {
  races: APIReference[];
  subraces: APIReference[];
  desc: string[];
  proficiencies: APIReference[];
  proficiency_choices?: ChoiceOption;
  trait_specific?: TraitSpecific;
  language_options?: ChoiceOption;
  parent?: APIReference;
}

export interface ChoiceOption {
  choose: number;
  type: string;
  from: OptionSet;
}

export interface OptionSet {
  option_set_type: string;
  options: TraitOption[];
}

export interface TraitOption {
  option_type: 'reference' | string;
  item: APIReference;
}

export interface TraitSpecific {
  spell_options?: ChoiceOption;
  subtrait_options?: ChoiceOption;
  damage_type?: APIReference;
  breath_weapon?: BreathWeapon;
}

export interface BreathWeapon {
  name: string;
  desc: string;
  area_of_effect: TraitAreaOfEffect;
  usage: Usage;
  dc: TraitDc;
  damage: TraitDamage[];
}

export interface TraitAreaOfEffect {
  size: number;
  type: 'cone' | 'line' | string;
}

export interface TraitDamage {
  damage_type: APIReference;
  // Dinâmico para suportar níveis como "2", "6", "11", etc.
  damage_at_character_level: { [level: string]: string };
}

export interface TraitDc {
  dc_type: APIReference;
  success_type: 'half' | 'none' | string;
}

export interface Usage {
  type: 'per rest' | 'recharge' | string;
  times: number;
}
