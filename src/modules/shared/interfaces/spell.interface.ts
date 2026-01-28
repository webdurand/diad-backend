import { AbilityScore } from './ability-score.interface';
import { Class } from './class.interface';
import { DamageType } from './damage-type.interface';
import { MagicSchool } from './magic-school.interface';
import { Subclass } from './subclass.interface';

export interface Spell {
  id: string;
  index: string;
  name: string;
  desc: string[];
  higher_level?: string[];
  range: string;
  components: Component[];
  material?: string;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  casting_time: string;
  level: number;
  attack_type?: AttackType;
  damage?: Damage;
  school: MagicSchool;
  classes: Class[];
  subclasses: Subclass[];
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

export enum Component {
  M = 'M',
  S = 'S',
  V = 'V',
}

export interface Damage {
  damage_type?: DamageType;
  damage_at_slot_level?: { [key: string]: string };
  damage_at_character_level?: { [key: string]: string };
}

export interface Dc {
  dc_type: AbilityScore;
  dc_success: DcSuccess;
  desc?: string;
}

export enum DcSuccess {
  Half = 'half',
  None = 'none',
  Other = 'other',
}
