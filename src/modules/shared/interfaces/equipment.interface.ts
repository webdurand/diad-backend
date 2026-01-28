import { AbilityScore } from './ability-score.interface';
import { Dc } from './common.interface';
import { DamageType } from './damage-type.interface';
import { EquipmentCategory } from './equipment-category.interface';
import { WeaponMasteryProperty } from './weapon-mastery-property.interface';
import { WeaponProperty } from './weapon-property.interface';

export enum Unit {
  Cp = 'cp',
  Sp = 'sp',
  Gp = 'gp',
}

export interface Cost {
  quantity: number;
  unit: Unit;
}

export interface Damage {
  damage_dice: string;
  damage_type: DamageType;
}

export interface ArmorClass {
  base: number;
  dex_bonus: boolean;
  max_bonus?: number;
}

export interface Utilize {
  name: string;
  dc: Dc;
}

export interface Equipment {
  id: string;
  index: string;
  name: string;
  equipment_categories: EquipmentCategory[];
  cost: Cost;
  weight: number;
  description?: string;
  image?: string;

  // Propriedades Específicas
  damage?: Damage;
  range?: { normal: number; long?: number };
  properties?: WeaponProperty[];
  mastery?: WeaponMasteryProperty;
  armor_class?: ArmorClass;

  // Novos campos 2024
  utilize?: Utilize[];
  craft?: Equipment[];
  ability?: AbilityScore;

  // Containers e Ammuniton
  contents?: Equipment[];
  container?: Equipment[];
  storage?: Equipment;
  quantity?: number;
  notes?: string[];

  // Tempos de armadura (usando string union em vez de Enum para ser mais flexível)
  don_time?: '1 minute' | '5 minutes' | '10 minutes' | string;
  doff_time?: '1 minute' | '5 minutes' | string;
  stealth_disadvantage?: boolean;
  str_minimum?: number;
}
