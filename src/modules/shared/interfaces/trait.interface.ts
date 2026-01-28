import { AbilityScore } from './ability-score.interface';
import { DamageType } from './damage-type.interface';
import { Proficiency } from './proficiency.interface';
import { Race } from './race.interface';
import { Subrace } from './subrace.interface';

export interface Trait {
  id: string;
  index: string;
  name: string;
  races: Race[];
  subraces: Subrace[];
  desc: string[];
  proficiencies: Proficiency[];
  proficiency_choices?: ChoiceOption;
  trait_specific?: TraitSpecific;
  language_options?: ChoiceOption;
  parent?: Trait;
}

export interface ChoiceOption {
  choose: number;
  type: string;
  from: OptionSet;
}

export interface OptionSet {
  option_set_type: string;
  options: Option[];
}

export interface Option {
  option_type: 'reference' | string;
  item: Proficiency;
}

export interface TraitSpecific {
  spell_options?: ChoiceOption;
  subtrait_options?: ChoiceOption;
  damage_type?: DamageType;
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
  damage_type: DamageType;
  damage_at_character_level: { [level: string]: string };
}

export interface TraitDc {
  dc_type: AbilityScore;
  success_type: 'half' | 'none' | string;
}

export interface Usage {
  type: 'per rest' | 'recharge' | string;
  times: number;
}
