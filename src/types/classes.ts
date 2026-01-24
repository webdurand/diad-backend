import { StatNameEnum } from './stats'; // 'str', 'dex', etc.
import { DiceType } from './common'; // 'd6', 'd8', etc.
import { ArmorType, ToolNameEnum, WeaponNameEnum, WeaponType } from './items';
import { SkillNameEnum } from './skills';
import { SubclassNameEnum } from './subclasses';

export enum ClassNameEnum {
  BARBARIAN = 'Bárbaro',
  BARD = 'Bardo',
  WARLOCK = 'Bruxo',
  CLERIC = 'Clérigo',
  DRUID = 'Druida',
  SORCERER = 'Feiticeiro',
  FIGHTER = 'Guerreiro',
  ROGUE = 'Ladino',
  WIZARD = 'Mago',
  MONK = 'Monge',
  PALADIN = 'Paladino',
  RANGER = 'Patrulheiro',
}

export type ClassType = `${ClassNameEnum}`;

// Tipos de escolhas que a classe pode oferecer
export type ClassChoiceType =
  | 'skill'
  | 'tool'
  | 'language'
  | 'equipment'
  | 'subclass'
  | 'fighting_style'
  | 'spell'
  | 'expertize'
  | 'asi'
  | 'subclass_feature_option'; // Ability Score Improvement

export interface ClassChoice {
  type: ClassChoiceType;
  amount: number; // Quantas escolhas? (ex: 2 perícias)
  options: any[]; // Lista de IDs ou objetos de opção
  description?: string;
}

// O "Grid" de evolução. Cada nível é uma linha desta interface.
export interface LevelEntry {
  level: number;
  pb: number; // Bônus de Proficiência (+2, +3...)

  // IDs das habilidades ganhas neste nível
  features: string[];

  // Colunas numéricas variáveis da tabela da classe
  // Bárbaro: { rages: 2, rage_damage: 2 }
  // Ladino: { sneak_attack_dice: "1d6" }
  // Monge: { ki: 5, movement_bonus: 3 }
  // Mago: { sorcery_points: 0 } (para feiticeiro)
  specifics: Record<string, number | string>;

  // Apenas para conjuradores (Espaços de Magia)
  // Array com 9 posições. Ex: [4, 2, 0, 0...] para nv 3
  spell_slots?: number[];
}

export interface ClassDefinition {
  id: string;
  name: ClassNameEnum;
  hit_die: DiceType;
  description?: string;

  // Subclasses
  subclasses_available_at_level: number;
  subclass_label: string;

  // Equipamento e Ouro
  fixed_equipment: {
    id: string | WeaponNameEnum | ToolNameEnum;
    amount: number;
  }[];
  starting_gold_formula?: string;

  // Multiclasse
  multiclass_req: Partial<Record<StatNameEnum, number>>;
  multiclass_proficiencies: {
    armor: ArmorType[];
    weapons: WeaponType[];
    tools: ToolNameEnum[];
    skill_amount?: number;
  };

  // Proficiências Iniciais
  proficiencies: {
    armor: ArmorType[];
    weapons: WeaponType[];
    tools: ToolNameEnum[];
    saving_throws: StatNameEnum[];
  };

  // Escolhas
  skill_choices: {
    amount: number;
    list: SkillNameEnum[];
  };
  equipment_choices: ClassChoice[];

  // Evolução
  progression: LevelEntry[];

  // Opcional: Para classes com magia
  spellcasting?: {
    ability: StatNameEnum;
    preparation_type: 'prepared' | 'known' | 'spellbook';
    multiplier: number;
  };
  subclasses: SubclassNameEnum[];
}
