import { APIReference } from './api-reference.interface';

export interface Spell extends APIReference {
  desc: string[];
  higher_level?: string[];
  range: Range;
  components: Component[];
  material?: string;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  casting_time: CastingTime;
  level: number;
  attack_type?: AttackType;
  damage?: Damage;
  school: School;
  classes: School[];
  subclasses: School[];
  dc?: Dc;
  heal_at_slot_level?: { [key: string]: string };
  area_of_effect?: AreaOfEffect;
}

export interface AreaOfEffect {
  type: Type;
  size: number;
}

export enum Type {
  Cone = 'cone',
  Cube = 'cube',
  Cylinder = 'cylinder',
  Line = 'line',
  Sphere = 'sphere',
}

export enum AttackType {
  Melee = 'melee',
  Ranged = 'ranged',
}

export enum CastingTime {
  The10Minutes = '10 minutes',
  The12Hours = '12 hours',
  The1Action = '1 action',
  The1BonusAction = '1 bonus action',
  The1Hour = '1 hour',
  The1Minute = '1 minute',
  The1Reaction = '1 reaction',
  The24Hours = '24 hours',
  The8Hours = '8 hours',
}

export interface School extends APIReference {}

export enum Component {
  M = 'M',
  S = 'S',
  V = 'V',
}

export interface Damage {
  damage_type?: School;
  damage_at_slot_level?: { [key: string]: string };
  damage_at_character_level?: { [key: string]: string };
}

export interface Dc {
  dc_type: School;
  dc_success: DcSuccess;
  desc?: string;
}

export enum DcSuccess {
  Half = 'half',
  None = 'none',
  Other = 'other',
}

export enum Range {
  Self = 'Self',
  Sight = 'Sight',
  Special = 'Special',
  The100Feet = '100 feet',
  The10Feet = '10 feet',
  The120Feet = '120 feet',
  The150Feet = '150 feet',
  The1Mile = '1 mile',
  The300Feet = '300 feet',
  The30Feet = '30 feet',
  The500Feet = '500 feet',
  The500Miles = '500 miles',
  The5Feet = '5 feet',
  The60Feet = '60 feet',
  The90Feet = '90 feet',
  Touch = 'Touch',
  Unlimited = 'Unlimited',
}
