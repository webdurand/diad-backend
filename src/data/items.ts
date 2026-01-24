import { ToolNameEnum, WeaponNameEnum } from 'src/types/items';

export const SIMPLE_WEAPONS_OPTIONS = [
  { label: 'Adaga', value: WeaponNameEnum.DAGGER },
  { label: 'Azagaia', value: WeaponNameEnum.JAVELIN },
  { label: 'Bordão', value: WeaponNameEnum.QUARTERSTAFF },
  { label: 'Clava Grande', value: WeaponNameEnum.GREATCLUB },
  { label: 'Foice Curta', value: WeaponNameEnum.SICKLE },
  { label: 'Lança', value: WeaponNameEnum.SPEAR },
  { label: 'Maça', value: WeaponNameEnum.MACE },
  { label: 'Machadinha', value: WeaponNameEnum.HANDAXE },
  { label: 'Martelo Leve', value: WeaponNameEnum.LIGHT_HAMMER },
  { label: 'Porrete', value: WeaponNameEnum.CLUB },
  { label: 'Arco Curto', value: WeaponNameEnum.SHORTBOW },
  { label: 'Besta Leve', value: WeaponNameEnum.LIGHT_CROSSBOW },
  { label: 'Dardo', value: WeaponNameEnum.DART },
  { label: 'Funda', value: WeaponNameEnum.SLING },
];

// Fonte: Tabela de Armas - Armas Marciais Corpo-a-Corpo [3-5]
export const MARTIAL_MELEE_OPTIONS = [
  { label: 'Alabarda', value: WeaponNameEnum.HALBERD },
  { label: 'Chicote', value: WeaponNameEnum.WHIP },
  { label: 'Cimitarra', value: WeaponNameEnum.SCIMITAR },
  { label: 'Espada Curta', value: WeaponNameEnum.SHORTSWORD },
  { label: 'Espada Grande', value: WeaponNameEnum.GREATSWORD },
  { label: 'Espada Longa', value: WeaponNameEnum.LONGSWORD },
  { label: 'Glaive', value: WeaponNameEnum.GLAIVE },
  { label: 'Lança de Montaria', value: WeaponNameEnum.LANCE },
  { label: 'Lança Longa', value: WeaponNameEnum.PIKE },
  { label: 'Maça Estrela', value: WeaponNameEnum.MORNINGSTAR },
  { label: 'Machado de Batalha', value: WeaponNameEnum.BATTLEAXE },
  { label: 'Machado Grande', value: WeaponNameEnum.GREATAXE },
  { label: 'Malho', value: WeaponNameEnum.MAUL },
  { label: 'Mangual', value: WeaponNameEnum.FLAIL },
  { label: 'Martelo de Guerra', value: WeaponNameEnum.WARHAMMER },
  { label: 'Picareta de Guerra', value: WeaponNameEnum.WAR_PICK },
  { label: 'Rapieira', value: WeaponNameEnum.RAPIER },
  { label: 'Tridente', value: WeaponNameEnum.TRIDENT },
];

export const MUSICAL_INSTRUMENTS_OPTIONS = [
  { label: 'Alaúde', value: ToolNameEnum.LUTE },
  { label: 'Flauta', value: ToolNameEnum.FLUTE },
  { label: 'Flauta de Pã', value: ToolNameEnum.PAN_FLUTE },
  { label: 'Gaita de Foles', value: ToolNameEnum.BAGPIPES },
  { label: 'Lira', value: ToolNameEnum.LYRE },
  { label: 'Oboé', value: ToolNameEnum.SHAWM },
  { label: 'Tambor', value: ToolNameEnum.DRUM },
  { label: 'Trombeta', value: ToolNameEnum.HORN },
  { label: 'Violino', value: ToolNameEnum.VIOL },
  { label: 'Xilofone', value: ToolNameEnum.DULCIMER },
];
