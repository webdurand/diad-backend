import {
  EquipmentPackNameEnum,
  ToolNameEnum,
  WeaponNameEnum,
} from 'src/types/items';

// Mantendo os que você já usa, mas garantindo que as chaves do Enum
// estejam no novo padrão consolidado (SNAKE_CASE)
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
  { label: 'Lira (Dulcimer)', value: ToolNameEnum.DULCIMER },
];

// --- AJUSTADOS PARA O NOVO PADRÃO ---

export const EQUIPMENT_PACK_OPTIONS = [
  {
    label: 'Pacote de Artista',
    value: EquipmentPackNameEnum.ENTERTAINERS_PACK,
  },
  { label: 'Pacote de Assaltante', value: EquipmentPackNameEnum.BURGLARS_PACK },
  {
    label: 'Pacote de Aventureiro',
    value: EquipmentPackNameEnum.DUNGEONEERS_PACK,
  },
  { label: 'Pacote de Diplomata', value: EquipmentPackNameEnum.DIPLOMATS_PACK },
  { label: 'Pacote de Estudioso', value: EquipmentPackNameEnum.SCHOLARS_PACK },
  {
    label: 'Pacote de Explorador',
    value: EquipmentPackNameEnum.EXPLORERS_PACK,
  },
  { label: 'Pacote de Sacerdote', value: EquipmentPackNameEnum.PRIESTS_PACK },
];

export const ARTISAN_TOOLS_OPTIONS = [
  { label: 'Ferramentas de Carpinteiro', value: ToolNameEnum.CARPENTER_TOOLS },
  {
    label: 'Ferramentas de Cartógrafo',
    value: ToolNameEnum.CARTOGRAPHER_TOOLS,
  },
  { label: 'Ferramentas de Costureiro', value: ToolNameEnum.WEAVER_TOOLS },
  { label: 'Ferramentas de Coureiro', value: ToolNameEnum.LEATHERWORKER_TOOLS },
  { label: 'Ferramentas de Entalhador', value: ToolNameEnum.WOODCARVER_TOOLS },
  { label: 'Ferramentas de Ferreiro', value: ToolNameEnum.SMITH_TOOLS },
  { label: 'Ferramentas de Funileiro', value: ToolNameEnum.TINKER_TOOLS },
  { label: 'Ferramentas de Joalheiro', value: ToolNameEnum.JEWELER_TOOLS },
  { label: 'Ferramentas de Oleiro', value: ToolNameEnum.POTTER_TOOLS },
  { label: 'Ferramentas de Pedreiro', value: ToolNameEnum.MASON_TOOLS },
  { label: 'Ferramentas de Pintor', value: ToolNameEnum.PAINTER_SUPPLIES },
  { label: 'Ferramentas de Sapateiro', value: ToolNameEnum.COBBLER_TOOLS },
  { label: 'Ferramentas de Vidreiro', value: ToolNameEnum.GLASSBLOWER_TOOLS },
  {
    label: 'Suprimentos de Alquimista',
    value: ToolNameEnum.ALCHEMIST_SUPPLIES,
  },
  {
    label: 'Suprimentos de Caligrafia',
    value: ToolNameEnum.CALLIGRAPHER_SUPPLIES,
  },
  { label: 'Suprimentos de Cervejeiro', value: ToolNameEnum.BREWER_SUPPLIES },
  { label: 'Utensílios de Cozinheiro', value: ToolNameEnum.COOK_UTENSILS },
];

export const GAMING_SET_OPTIONS = [
  { label: 'Baralho de Cartas', value: ToolNameEnum.PLAYING_CARD_SET },
  { label: 'Conjunto de Dados', value: ToolNameEnum.DICE_SET },
  { label: 'Jogo dos Três Dragões', value: ToolNameEnum.THREE_DRAGON_ANTE_SET },
  { label: 'Xadrez do Dragão', value: ToolNameEnum.DRAGONCHESS_SET },
];
