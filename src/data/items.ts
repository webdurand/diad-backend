import {
  EquipmentPackNameEnum,
  ToolNameEnum,
  WeaponNameEnum,
} from 'src/types/items';

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

// Fonte: Pacotes de Equipamento [2-4]
export const EQUIPMENT_PACK_OPTIONS = [
  { label: 'Pacote de Artista', value: EquipmentPackNameEnum.EntertainersPack },
  { label: 'Pacote de Assaltante', value: EquipmentPackNameEnum.BurglarsPack },
  {
    label: 'Pacote de Aventureiro',
    value: EquipmentPackNameEnum.DungeoneersPack,
  },
  { label: 'Pacote de Diplomata', value: EquipmentPackNameEnum.DiplomatsPack },
  { label: 'Pacote de Estudioso', value: EquipmentPackNameEnum.ScholarsPack },
  { label: 'Pacote de Explorador', value: EquipmentPackNameEnum.ExplorersPack },
  { label: 'Pacote de Sacerdote', value: EquipmentPackNameEnum.PriestsPack },
];

// Fonte: Ferramentas [5]
export const ARTISAN_TOOLS_OPTIONS = [
  { label: 'Ferramentas de Carpinteiro', value: ToolNameEnum.CarpentersTools },
  {
    label: 'Ferramentas de Cartógrafo',
    value: ToolNameEnum.CartographersTools,
  },
  { label: 'Ferramentas de Costureiro', value: ToolNameEnum.WeaversTools },
  { label: 'Ferramentas de Coureiro', value: ToolNameEnum.LeatherworkersTools },
  { label: 'Ferramentas de Entalhador', value: ToolNameEnum.WoodcarversTools },
  { label: 'Ferramentas de Ferreiro', value: ToolNameEnum.SmithsTools },
  { label: 'Ferramentas de Funileiro', value: ToolNameEnum.TinkersTools },
  { label: 'Ferramentas de Joalheiro', value: ToolNameEnum.JewelersTools },
  { label: 'Ferramentas de Oleiro', value: ToolNameEnum.PottersTools },
  { label: 'Ferramentas de Pedreiro', value: ToolNameEnum.MasonsTools },
  { label: 'Ferramentas de Pintor', value: ToolNameEnum.PaintersSupplies },
  { label: 'Ferramentas de Sapateiro', value: ToolNameEnum.CobblersTools },
  { label: 'Ferramentas de Vidreiro', value: ToolNameEnum.GlassblowersTools },
  {
    label: 'Suprimentos de Alquimista',
    value: ToolNameEnum.AlchemistsSupplies,
  },
  {
    label: 'Suprimentos de Caligrafia',
    value: ToolNameEnum.CalligraphersSupplies,
  },
  { label: 'Suprimentos de Cervejeiro', value: ToolNameEnum.BrewersSupplies },
  { label: 'Utensílios de Cozinheiro', value: ToolNameEnum.CooksUtensils },
];

// Fonte: Ferramentas [6]
export const GAMING_SET_OPTIONS = [
  { label: 'Baralho de Cartas', value: ToolNameEnum.PlayingCardSet },
  { label: 'Conjunto de Dados', value: ToolNameEnum.DiceSet },
  { label: 'Jogo dos Três Dragões', value: ToolNameEnum.ThreeDragonAnteSet },
  { label: 'Xadrez do Dragão', value: ToolNameEnum.DragonChessSet },
];
