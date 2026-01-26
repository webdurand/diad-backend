import { ClassNameEnum } from './classes';
import { StatNameEnum } from './stats';
import { DiceType } from './common';

export enum SpellSchoolEnum {
  ABJURATION = 'Abjuração',
  CONJURATION = 'Conjuração',
  DIVINATION = 'Adivinhação',
  ENCHANTMENT = 'Encantamento',
  EVOCATION = 'Evocação',
  ILLUSION = 'Ilusão',
  NECROMANCY = 'Necromancia',
  TRANSMUTATION = 'Transmutação',
}

export enum ComponentTypeEnum {
  VERBAL = 'V',
  SOMATIC = 'S',
  MATERIAL = 'M',
}

export enum DamageTypeEnum {
  ACID = 'Ácido',
  BLUDGEONING = 'Concussão',
  COLD = 'Frio',
  FIRE = 'Fogo',
  FORCE = 'Energia',
  LIGHTNING = 'Elétrico',
  NECROTIC = 'Necrótico',
  PIERCING = 'Perfurante',
  POISON = 'Veneno',
  PSYCHIC = 'Psíquico',
  RADIANT = 'Radiante',
  SLASHING = 'Cortante',
  THUNDER = 'Trovão',
}

export type AreaShape =
  | 'cone'
  | 'cube'
  | 'cylinder'
  | 'line'
  | 'sphere'
  | 'point';

export interface SpellDamage {
  dice_count?: number;
  dice_type?: DiceType;
  damage_type: DamageTypeEnum;
  flat_bonus?: number;
  condition?: string; // Ex: "no início do turno" ou "se falhar no teste"
}

export interface SpellDefinition {
  id: string;
  name: string;
  level: number;
  school: SpellSchoolEnum;
  ritual: boolean;
  classes: ClassNameEnum[];

  // Tempo de Conjuração
  casting_time: {
    amount: number;
    unit: 'action' | 'bonus_action' | 'reaction' | 'minute' | 'hour';
    reaction_trigger?: string;
  };

  // Alcance (Até onde a magia é projetada)
  range: {
    type: 'self' | 'touch' | 'distance' | 'special' | 'sight' | 'unlimited';
    distance_amount?: number; // em pés/metros
  };

  // Área de Efeito (O que ela ocupa a partir do ponto de origem)
  area?: {
    shape: AreaShape;
    size: number; // Raio da esfera, lado do cubo, comprimento da linha
  };

  // Componentes
  components: {
    list: ComponentTypeEnum[];
    material_description?: string;
    material_cost_gp?: number;
    materials_consumed?: boolean;
  };

  // Duração
  duration: {
    type:
      | 'instantaneous'
      | 'concentration'
      | 'timed'
      | 'until_dispelled'
      | 'special';
    amount?: number;
    unit?: 'round' | 'minute' | 'hour' | 'day';
  };

  // Mecânicas de Ataque/Resistência
  attack_type?: 'melee' | 'ranged';
  save_required?: StatNameEnum;
  save_effect?: 'half' | 'none' | 'negate' | 'special';

  // Dano e Cura (Transformados em Arrays para suportar efeitos múltiplos)
  damage?: SpellDamage[];

  healing?: {
    dice_count: number;
    dice_type: DiceType;
    flat_bonus?: number;
  };

  // Descrição Textual
  description: string;

  // Escalonamento Programável
  higher_levels?: {
    description: string;
    scaling_metadata?: {
      extra_dice_count?: number; // Ex: +1 (para cada nível acima)
      extra_targets?: number;
      extra_damage_type?: 'dice' | 'flat';
    };
  };

  tags?: (
    | 'combat'
    | 'buff'
    | 'debuff'
    | 'utility'
    | 'social'
    | 'control'
    | 'detection'
  )[];
}
