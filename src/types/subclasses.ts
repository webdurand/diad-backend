import { ArmorTypeEnum, ToolNameEnum, WeaponTypeEnum } from './items';
import { ClassChoice } from './classes'; // Reutilizando a interface de escolhas

export enum SubclassNameEnum {
  // Bárbaro [1-3]
  Berserker = 'berserker', // Caminho do Furioso
  TotemWarrior = 'totem_warrior', // Caminho do Guerreiro Totêmico

  // Bardo [4]
  CollegeOfValor = 'college_of_valor', // Colégio da Bravura
  CollegeOfLore = 'college_of_lore', // Colégio do Conhecimento
  // Nota: O Colégio do Conhecimento não foi detalhado nos trechos fornecidos.

  // Bruxo [5-8]
  TheArchfey = 'the_archfey', // A Arquifada
  TheFiend = 'the_fiend', // O Corruptor
  TheGreatOldOne = 'the_great_old_one', // O Grande Antigo

  // Clérigo [9-15]
  KnowledgeDomain = 'knowledge_domain', // Domínio do Conhecimento
  TrickeryDomain = 'trickery_domain', // Domínio da Enganação
  WarDomain = 'war_domain', // Domínio da Guerra
  LightDomain = 'light_domain', // Domínio da Luz
  NatureDomain = 'nature_domain', // Domínio da Natureza
  TempestDomain = 'tempest_domain', // Domínio da Tempestade
  LifeDomain = 'life_domain', // Domínio da Vida

  // Druida [16, 17]
  CircleOfTheLand = 'circle_of_the_land', // Círculo da Terra
  CircleOfTheMoon = 'circle_of_the_moon', // Círculo da Lua

  // Feiticeiro [18, 19]
  DraconicBloodline = 'draconic_bloodline', // Ancestral Dracônico
  WildMagic = 'wild_magic', // Magia Selvagem (Inferido pela Tabela de Surto)

  // Guerreiro [20-23]
  Champion = 'champion', // Campeão
  EldritchKnight = 'eldritch_knight', // Cavaleiro Arcano
  BattleMaster = 'battle_master', // Mestre de Batalha

  // Ladino [24-26]
  Assassin = 'assassin', // Assassino
  Thief = 'thief', // Ladrão
  ArcaneTrickster = 'arcane_trickster', // Trapaceiro Arcano

  // Mago [27, 28]
  SchoolOfEvocation = 'school_of_evocation', // Escola de Evocação
  SchoolOfTransmutation = 'school_of_transmutation', // Escola de Transmutação
  // Nota: Outras escolas não foram detalhadas nos trechos fornecidos.

  // Monge [29-32]
  WayOfTheOpenHand = 'way_of_the_open_hand', // Caminho da Mão Aberta
  WayOfShadow = 'way_of_shadow', // Caminho Sombrio
  WayOfTheFourElements = 'way_of_the_four_elements', // Caminho dos Quatro Elementos

  // Paladino [33-36]
  OathOfDevotion = 'oath_of_devotion', // Juramento de Devoção
  OathOfTheAncients = 'oath_of_the_ancients', // Juramento dos Anciões
  OathOfVengeance = 'oath_of_vengeance', // Juramento de Vingança

  // Patrulheiro [37-40]
  BeastConclave = 'beast_conclave', // Conclave da Besta
  HunterConclave = 'hunter_conclave', // Conclave do Caçador
  UnderdarkStalkerConclave = 'underdark_stalker_conclave', // Conclave do Rastreador Subterrâneo
}

export type SubclassType = `${SubclassNameEnum}`;

export interface SubclassFeature {
  level: number;
  id: string;
  name: string;
  description: string;
  // Se essa feature exige uma escolha (ex: Totem do Urso vs Águia)
  choices?: ClassChoice;
}

export interface SubclassDefinition {
  id: string;
  parent_class_id: string; // Ex: 'barbarian'
  name: string;
  description: string;

  features: SubclassFeature[];

  // Proficiências extras (comum em Clérigos e alguns Bardos)
  extra_proficiencies?: {
    armor?: ArmorTypeEnum[];
    weapons?: WeaponTypeEnum[];
    tools?: ToolNameEnum[];
  };

  // Magias concedidas pela subclasse (Ex: Domínios de Clérigo, Patronos de Bruxo)
  // Mapeado por Nível de Personagem -> Lista de IDs de Magias
  additional_spells?: Record<number, string[]>;
}
