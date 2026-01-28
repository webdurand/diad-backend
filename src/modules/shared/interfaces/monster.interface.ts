import { AbilityScore } from './ability-score.interface';
import { APIReference } from './api-reference.interface';
import { Dc } from './common.interface';
import { Condition } from './condition.interface';
import { DamageType } from './damage-type.interface';
import { Equipment } from './equipment.interface';
import { Spell } from './spell.interface';

// =========================
// ENUMS
// =========================

export enum OptionSetType {
  OptionsArray = 'options_array',
}

export enum ItemOptionType {
  Action = 'action',
  Multiple = 'multiple',
}

export enum ActionType {
  Ability = 'ability',
  Magic = 'magic',
  Melee = 'melee',
  Ranged = 'ranged',
}

export enum SuccessType {
  Half = 'half',
  None = 'none',
}

export enum OptionType {
  Breath = 'breath',
}

export enum MultiattackType {
  ActionOptions = 'action_options',
  Actions = 'actions',
}

export enum OptionsType {
  Attack = 'attack',
}

export enum RestType {
  Long = 'long',
  Short = 'short',
}

export enum ActionUsageType {
  PerDay = 'per day',
  RechargeAfterREST = 'recharge after rest',
  RechargeOnRoll = 'recharge on roll',
}

export enum ArmorClassType {
  Armor = 'armor',
  Condition = 'condition',
  Dex = 'dex',
  Natural = 'natural',
  Spell = 'spell',
}

export enum Size {
  Gargantuan = 'Gargantuan',
  Huge = 'Huge',
  Large = 'Large',
  Medium = 'Medium',
  Small = 'Small',
  Tiny = 'Tiny',
}

export enum ComponentsRequired {
  M = 'M',
  S = 'S',
  V = 'V',
}

export enum School {
  Cleric = 'cleric',
  Druid = 'druid',
  Wizard = 'wizard',
}

export enum SpellUsageType {
  AtWill = 'at will',
  PerDay = 'per day',
}

export enum MonsterType {
  Aberration = 'aberration',
  Beast = 'beast',
  Celestial = 'celestial',
  Construct = 'construct',
  Dragon = 'dragon',
  Elemental = 'elemental',
  Fey = 'fey',
  Fiend = 'fiend',
  Giant = 'giant',
  Humanoid = 'humanoid',
  Monstrosity = 'monstrosity',
  Ooze = 'ooze',
  Plant = 'plant',
  SwarmOfTinyBeasts = 'swarm of Tiny beasts',
  Undead = 'undead',
}

// =========================
// INTERFACES & TYPES
// =========================

export interface Monster extends APIReference {
  size: Size;
  type: MonsterType;
  alignment: string; // Pode ser "any alignment", "chaotic evil", "neutral good", etc.
  armor_class: ArmorClass[];
  hit_points: number;
  hit_dice: string;
  hit_points_roll: string;
  speed: Speed;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  proficiencies: Proficiency[];
  damage_vulnerabilities: string[];
  damage_resistances: string[];
  damage_immunities: string[];
  condition_immunities: Condition[];
  senses: Senses;
  languages: string;
  challenge_rating: number;
  proficiency_bonus: number;
  xp: number;
  special_abilities?: SpecialAbility[];
  actions?: MonsterAction[];
  legendary_actions?: LegendaryAction[];
  image: string;
  desc?: string;
  subtype?: string;
  reactions?: Reaction[];
  forms?: APIReference[];
}

export interface MonsterAction {
  name: string;
  multiattack_type?: MultiattackType;
  desc: string;
  actions?: ActionAction[];
  attack_bonus?: number;
  dc?: Dc;
  damage?: ActionDamage[];
  usage?: ActionUsage;
  options?: Options;
  attacks?: Attack[];
  action_options?: ActionOptions;
}

export interface ActionOptions {
  choose: number;
  type: ItemOptionType;
  from: ActionOptionsFrom;
}

export interface ActionOptionsFrom {
  option_set_type: OptionSetType;
  options: ItemElement[];
}

export interface ItemElement {
  option_type: ItemOptionType;
  items?: ItemElement[];
  action_name?: string;
  count?: number;
  type?: ActionType;
  desc?: string;
}

export interface ActionAction {
  action_name: string;
  count: number | string;
  type: ActionType;
}

export interface Attack {
  name: string;
  dc: Dc;
  damage?: AttackDamage[];
  option_type?: OptionType;
}

export interface AttackDamage {
  damage_type: DamageType;
  damage_dice: string;
}

export type ConditionImmunity = APIReference;

export interface ActionDamage {
  damage_type?: DamageType;
  damage_dice?: string;
  dc?: Dc;
  choose?: number;
  type?: string;
  from?: DamageFrom;
}

export interface DamageFrom {
  option_set_type: OptionSetType;
  options: DamageChoiceOption[];
}

export interface DamageChoiceOption {
  option_type: string;
  damage_type: DamageType;
  damage_dice: string;
  notes?: string;
}

export interface Options {
  choose: number;
  type: OptionsType;
  from: OptionsFrom;
}

export interface OptionsFrom {
  option_set_type: OptionSetType;
  options: Attack[];
}

export interface ActionUsage {
  type: ActionUsageType;
  times?: number;
  dice?: string;
  min_value?: number;
  rest_types?: RestType[];
}

export interface ArmorClass {
  type: ArmorClassType;
  value: number;
  spell?: Spell;
  armor?: Equipment[];
  desc?: string;
}

export interface LegendaryAction {
  name: string;
  desc: string;
  damage?: AttackDamage[];
  dc?: Dc;
  attack_bonus?: number;
}

export interface Proficiency {
  value: number;
  proficiency: APIReference;
}

export interface Reaction {
  name: string;
  desc: string;
  dc?: Dc;
}

export interface Senses {
  darkvision?: string;
  passive_perception: number;
  blindsight?: string;
  truesight?: string;
  tremorsense?: string;
}

export interface SpecialAbility {
  name: string;
  desc: string;
  dc?: Dc;
  spellcasting?: Spellcasting;
  usage?: SpecialAbilityUsage;
  damage?: AttackDamage[];
}

export interface Spellcasting {
  ability?: AbilityScore;
  modifier?: number;
  dc?: number;
  components_required: ComponentsRequired[];
  slots?: { [key: string]: number };
  usage?: ActionUsage;
  spells: SpellcastingSpell[];
}

export interface SpellcastingSpell {
  name: string;
  level: number;
  url: string;
  usage?: SpellUsage;
}

export interface SpellUsage {
  type: SpellUsageType;
  times?: number;
}

export interface SpecialAbilityUsage {
  type: ActionUsageType;
  times?: number;
  rest_types?: RestType[];
}

export interface Speed {
  walk?: string;
  swim?: string;
  fly?: string;
  burrow?: string;
  climb?: string;
  hover?: boolean;
}
