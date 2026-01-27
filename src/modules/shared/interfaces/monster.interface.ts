import { Alignment } from './alignment.interface';
import { APIReference } from './api-reference.interface';
import { Dc } from './common.interface';
export interface Monster extends APIReference {
  size: Size;
  type: MonsterType;
  alignment: Alignment[];
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
  condition_immunities: APIReference[];
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

export enum OptionSetType {
  OptionsArray = 'options_array',
}

export interface ItemElement {
  option_type: ItemOptionType;
  items?: ItemElement[];
  action_name?: string;
  count?: number;
  type?: ActionType;
  desc?: string;
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
  damage_type: ConditionImmunity;
  damage_dice: string;
}

export type ConditionImmunity = APIReference;

export enum SuccessType {
  Half = 'half',
  None = 'none',
}

export enum OptionType {
  Breath = 'breath',
}

export interface ActionDamage {
  damage_type?: ConditionImmunity;
  damage_dice?: string;
  dc?: Dc;
  choose?: number;
  type?: DamageType;
  from?: DamageFrom;
}

export interface DamageFrom {
  option_set_type: OptionSetType;
  options: DamageChoiceOption[];
}

export interface DamageChoiceOption {
  option_type: DamageType;
  damage_type: ConditionImmunity;
  damage_dice: string;
  notes?: Notes;
}

export enum Notes {
  OneHanded = 'One handed',
  TwoHanded = 'Two handed',
  WithShillelagh = 'With shillelagh',
}

export enum DamageType {
  Damage = 'damage',
}

export enum MultiattackType {
  ActionOptions = 'action_options',
  Actions = 'actions',
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

export enum OptionsType {
  Attack = 'attack',
}

export interface ActionUsage {
  type: ActionUsageType;
  times?: number;
  dice?: Dice;
  min_value?: number;
  rest_types?: RestType[];
}

export enum Dice {
  The1D6 = '1d6',
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

export interface ArmorClass {
  type: ArmorClassType;
  value: number;
  condition?: ConditionImmunity;
  spell?: ConditionImmunity;
  armor?: ConditionImmunity[];
  desc?: string;
}

export enum ArmorClassType {
  Armor = 'armor',
  Condition = 'condition',
  Dex = 'dex',
  Natural = 'natural',
  Spell = 'spell',
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
  darkvision?: Blindsight;
  passive_perception: number;
  blindsight?: Blindsight;
  truesight?: Blindsight;
  tremorsense?: Blindsight;
}

export enum Blindsight {
  The10Ft = '10 ft.',
  The120Ft = '120 ft.',
  The30Ft = '30 ft.',
  The30FtBlindBeyondThisRadius = '30 ft. (blind beyond this radius)',
  The30FtOr10FtWhileDeafenedBlindBeyondThisRadius = '30 ft. or 10 ft. while deafened (blind beyond this radius)',
  The60Ft = '60 ft.',
  The60FtBlindBeyondThisRadius = '60 ft. (blind beyond this radius)',
  The90Ft = '90 ft.',
}

export enum Size {
  Gargantuan = 'Gargantuan',
  Huge = 'Huge',
  Large = 'Large',
  Medium = 'Medium',
  Small = 'Small',
  Tiny = 'Tiny',
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
  level?: number;
  ability: ConditionImmunity;
  dc?: number;
  modifier?: number;
  components_required: ComponentsRequired[];
  school?: School;
  slots?: { [key: string]: number };
  spells: Spell[];
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

export interface Spell {
  name: string;
  level: number;
  url: string;
  usage?: SpellUsage;
  notes?: string;
}

export interface SpellUsage {
  type: SpellUsageType;
  times?: number;
}

export enum SpellUsageType {
  AtWill = 'at will',
  PerDay = 'per day',
}

export interface SpecialAbilityUsage {
  type: ActionUsageType;
  times?: number;
  rest_types?: RestType[];
}

export interface Speed {
  walk?: Burrow;
  swim?: Climb;
  fly?: Climb;
  burrow?: Burrow;
  climb?: Climb;
  hover?: boolean;
}

export enum Burrow {
  The0Ft = '0 ft.',
  The10Ft = '10 ft.',
  The15Ft = '15 ft.',
  The20Ft = '20 ft.',
  The25Ft = '25 ft.',
  The30Ft = '30 ft.',
  The40Ft = '40 ft.',
  The50Ft = '50 ft.',
  The5Ft = '5 ft.',
  The60Ft = '60 ft.',
}

export enum Climb {
  The10Ft = '10 ft.',
  The120Ft = '120 ft.',
  The150Ft = '150 ft.',
  The20Ft = '20 ft.',
  The30Ft = '30 ft.',
  The40Ft = '40 ft.',
  The50Ft = '50 ft.',
  The60Ft = '60 ft.',
  The80Ft = '80 ft.',
  The90Ft = '90 ft.',
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
