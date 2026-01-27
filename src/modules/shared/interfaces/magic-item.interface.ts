export enum MagicItemRarity {
  Artifact = 'Artifact',
  Common = 'Common',
  Legendary = 'Legendary',
  Rare = 'Rare',
  Uncommon = 'Uncommon',
  Varies = 'Varies',
  VeryRare = 'Very Rare',
}

export interface APIReference {
  index: string;
  name: string;
  url: string;
}

export interface MagicItem {
  id?: number;
  index: string;
  name: string;
  equipmentCategory: APIReference;
  rarity: {
    name: MagicItemRarity | string;
  };
  variants: APIReference[];
  variant: boolean;
  desc: string[];
  image?: string;
  url: string;
}
