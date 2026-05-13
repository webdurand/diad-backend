

export interface EquipmentArmorClass {
  base: number;
  dex_bonus?: boolean;
  max_bonus?: number;
}

export interface EquipmentDamage {
  damage_dice: string;
  damage_type?: {
    index?: string;
    name?: string;
    url?: string;
  };
}

export interface EquipmentRange {
  normal?: number;
  long?: number;
}

export interface EquipmentCost {
  quantity?: number;
  unit?: string;
}

export interface EquipmentProperty {
  index?: string;
  name?: string;
  url?: string;
  description?: string;
}

export interface ConsumableEffect {
  type?: string;
  dice?: string;
  bonus?: number;
  description?: string;
}
