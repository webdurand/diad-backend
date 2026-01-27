import { APIReference } from './api-reference.interface';

export enum Unit {
  Cp = 'cp',
  Sp = 'sp',
  Gp = 'gp',
}

export interface QuantityReference extends APIReference {
  quantity?: number;
  item?: APIReference; // Para casos onde um item aponta para outro dentro de um array
}

export interface Cost {
  quantity: number;
  unit: Unit;
}

export interface Damage {
  damage_dice: string;
  damage_type: APIReference;
}

export interface ArmorClass {
  base: number;
  dex_bonus: boolean;
  max_bonus?: number;
}

export interface Dc {
  dc_type: APIReference;
  dc_value?: number;
  success_type: string;
}

export interface Utilize {
  name: string;
  dc: Dc;
}

export interface Equipment extends APIReference {
  equipment_categories: APIReference[];
  cost: Cost;
  weight: number;
  description?: string;
  url: string;
  image?: string;

  // Propriedades Específicas
  damage?: Damage;
  range?: { normal: number; long?: number };
  properties?: APIReference[];
  mastery?: APIReference;
  armor_class?: ArmorClass;

  // Novos campos 2024
  utilize?: Utilize[];
  craft?: APIReference[];
  ability?: APIReference;

  // Containers e Ammuniton
  contents?: QuantityReference[];
  container?: APIReference[];
  storage?: APIReference;
  quantity?: number;
  notes?: string[];

  // Tempos de armadura (usando string union em vez de Enum para ser mais flexível)
  don_time?: '1 minute' | '5 minutes' | '10 minutes' | string;
  doff_time?: '1 minute' | '5 minutes' | string;
  stealth_disadvantage?: boolean;
  str_minimum?: number;
}
