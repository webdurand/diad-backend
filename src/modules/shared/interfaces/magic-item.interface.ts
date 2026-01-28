import { EquipmentCategory } from './equipment-category.interface';

export enum MagicItemRarity {
  Artifact = 'Artifact',
  Common = 'Common',
  Legendary = 'Legendary',
  Rare = 'Rare',
  Uncommon = 'Uncommon',
  Varies = 'Varies',
  VeryRare = 'Very Rare',
}

export interface MagicItem {
  id: string;
  index: string;
  name: string;
  equipment_category: EquipmentCategory;
  rarity: {
    name: MagicItemRarity | string;
  };
  variants: MagicItem[];
  variant: boolean;
  desc: string[];
  image?: string;
}
