import { LanguageType } from './languages';
import { HabilityScores } from './stats';
import { Subrace } from './subraces';
import { TraitNameType } from './traits';

export enum RaceNameEnum {
  // --- Raças do Livro do Jogador (Core) ---
  DWARF = 'Anão', // [1, 2] Inclui da Colina, da Montanha e Duergar (MM)
  ELF = 'Elfo', // [1, 3] Inclui Alto, da Floresta e Drow
  HALFLING = 'Halfling', // [1, 4] Inclui Pés-Leves e Robusto
  HUMAN = 'Humano', // [1, 5] Inclui diversas etnias
  DRAGONBORN = 'Draconato', // [1, 6]
  GNOME = 'Gnomo', // [7, 8] Inclui da Floresta, das Rochas e das Profundezas (MM)
  HALF_ELF = 'Meio-Elfo', // [7, 9]
  HALF_ORC = 'Meio-Orc', // [7, 10]
  TIEFLING = 'Tiefling', // [7, 11]

  // --- Raças do Manual dos Monstros (Exóticas/Monstruosas) ---
  // Estas aparecem como humanoides com cultura/idioma próprios nas fontes
  AARAKOCRA = 'Aarakocra', // [12, 13] Povo pássaro
  BULLYWUG = 'Bullywug', // [14, 15] Povo sapo
  CENTAUR = 'Centauro', // [16, 17]
  GITH = 'Gith', // [18, 19] Inclui Githyanki e Githzerai
  GNOLL = 'Gnoll', // [18, 20]
  GOBLIN = 'Goblin', // [18] (Mencionado na lista de humanoides)
  HOBGOBLIN = 'Hobgoblin', // [21] (Mencionado na lista de humanoides)
  BUGBEAR = 'Bugbear', // [14, 22] (Mencionado na lista de humanoides)
  GRIMLOCK = 'Grimlock', // [21, 23] Humanoides cegos do subterrâneo
  KENKU = 'Kenku', // [24, 25] Povo corvo sem asas
  KOBOLD = 'Kobold', // [24, 26]
  KUO_TOA = 'Kuo-toa', // [24, 27] Povo peixe insano
  LIZARDFOLK = 'Povo Lagarto', // [28, 29] (Homem-Lagarto)
  MERFOLK = 'Povo do Mar', // [28, 30]
  ORC = 'Orc', // [31, 32] (Versão completa do MM)
  SAHUAGIN = 'Sahuagin', // [31, 33] "Demônios do mar"
  THRI_KREEN = 'Thri-kreen', // [34, 35] Povo inseto do deserto
  TROGLODYTE = 'Troglodita', // [34, 36] Povo réptil do subterrâneo
  YUAN_TI = 'Yuan-ti', // [37, 38] Povo serpente (Puro-sangue é o mais humanoide)

  // --- Outros Humanoides Mencionados ---
  AZER = 'Azer', // [14, 39] Anões de fogo (Tipo: Elemental, mas forma humanoide)
  QUAGGOTH = 'Quaggoth', // [28, 40] Humanoides bestiais do subterrâneo
  MINOTAUR = 'Minotauro', // [41, 42] (Tipo: Monstruosidade, mas muitas vezes jogável)
}

export type RaceType = `${RaceNameEnum}`;

export type ChoiceType =
  | 'language'
  | 'tool_proficiency'
  | 'draconic_ancestry'
  | 'stat_increase'
  | 'skill_proficiency'
  | 'feat'
  | 'cantrip';

export interface ChoiceOption {
  label: string;
  value: string;
  metadata?: Record<string, any>;
}

export interface ChoiceRestriction {
  exclude?: string[];
  includeOnly?: string[];
  unique?: boolean;
}

export interface RaceChoice {
  type: ChoiceType;
  amount: number;
  description?: string;
  options?: ChoiceOption[] | 'all';
  restriction?: ChoiceRestriction;
}

export interface Race {
  race: RaceType;
  base_stats: Partial<HabilityScores>;
  speed: number;
  size: 'Small' | 'Medium' | 'Large';
  fixed_traits: TraitNameType[];
  fixed_skills: string[];
  choices: RaceChoice[];
  languages: LanguageType[];
  subraces: Subrace[];
}
