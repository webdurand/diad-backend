import { APIReference } from './api-reference.interface';

export interface Cost {
  quantity: number;
  unit: string;
}

export interface Damage {
  damage_dice: string;
  damage_type: APIReference;
}

export interface Equipment {
  index: string;
  name: string;
  equipment_categories: APIReference[];
  cost: Cost;
  weight: number;
  url: string;
  description?: string;
  image?: string;

  // Propriedades de Armas
  damage?: Damage;
  two_handed_damage?: Damage;
  range?: { normal: number; long?: number };
  throw_range?: { normal: number; long?: number };
  properties?: APIReference[];
  mastery?: APIReference;
  ammunition?: APIReference;

  // Propriedades de Armaduras
  armor_class?: { base: number; dex_bonus: boolean; max_bonus?: number };
  str_minimum?: number;
  stealth_disadvantage?: boolean;
  don_time?: string;
  doff_time?: string;

  // Propriedades de Ferramentas e Kits
  ability?: APIReference;
  craft?: APIReference[];
  utilize?: Array<{
    name: string;
    dc: { dc_type: APIReference; dc_value: number; success_type: string };
  }>;

  // Propriedades de Pacotes (Packs) e Recipientes
  contents?: Array<{ item: APIReference; quantity: number }>;
  container?: APIReference[];
  storage?: APIReference;
  quantity?: number; // Ex: 20 flechas
}
