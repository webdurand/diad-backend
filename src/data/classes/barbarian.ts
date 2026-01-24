import { ClassDefinition, ClassNameEnum } from 'src/types/classes';
import { ArmorTypeEnum, WeaponNameEnum, WeaponTypeEnum } from 'src/types/items';
import { SkillNameEnum } from 'src/types/skills';
import { StatNameEnum } from 'src/types/stats';
import { MARTIAL_MELEE_OPTIONS, SIMPLE_WEAPONS_OPTIONS } from '../items';

export const Barbarian: ClassDefinition = {
  id: 'barbarian',
  name: ClassNameEnum.BARBARIAN,
  hit_die: 'd12',
  subclasses_available_at_level: 3,

  multiclass_req: {
    [StatNameEnum.STRENGTH]: 13,
  },

  fixed_equipment: [
    { id: 'explorers_pack', amount: 1 },
    { id: 'javelin', amount: 4 },
  ],

  proficiencies: {
    armor: [ArmorTypeEnum.LIGHT, ArmorTypeEnum.MEDIUM, ArmorTypeEnum.SHIELD],
    weapons: [WeaponTypeEnum.SIMPLE, WeaponTypeEnum.MARTIAL],
    tools: [],
    saving_throws: [StatNameEnum.STRENGTH, StatNameEnum.CONSTITUTION],
  },

  multiclass_proficiencies: {
    armor: [ArmorTypeEnum.SHIELD],
    weapons: [WeaponTypeEnum.SIMPLE, WeaponTypeEnum.MARTIAL],
    tools: [],
  },

  skill_choices: {
    amount: 2,
    list: [
      SkillNameEnum.ANIMAL_HANDLING,
      SkillNameEnum.ATHLETICS,
      SkillNameEnum.INTIMIDATION,
      SkillNameEnum.NATURE,
      SkillNameEnum.PERCEPTION,
      SkillNameEnum.SURVIVAL,
    ],
  },

  equipment_choices: [
    // Opção 1: (a) Machado Grande ou (b) Qualquer Arma Marcial Corpo-a-Corpo [7]
    {
      type: 'equipment',
      amount: 1,
      description: 'Arma Principal',
      options: [
        // Opção A: Item específico
        {
          label: 'Machado Grande',
          value: WeaponNameEnum.GREATAXE,
        },
        // Opção B: Espalha todas as opções da categoria marcial corpo-a-corpo
        ...MARTIAL_MELEE_OPTIONS,
      ],
    },

    // Opção 2: (a) Dois Machados de Mão ou (b) Qualquer Arma Simples [8]
    {
      type: 'equipment',
      amount: 1, // O jogador faz 1 escolha entre A ou B
      description: 'Armas Secundárias',
      options: [
        // Opção A: Item específico com quantidade
        {
          label: 'Dois Machados de Mão',
          value: WeaponNameEnum.HANDAXE,
          metadata: { quantity: 2 }, // O sistema deve ler isso e adicionar 2 itens
        },
        // Opção B: Qualquer arma simples (corpo-a-corpo ou distância)
        ...SIMPLE_WEAPONS_OPTIONS,
      ],
    },
  ],

  // TABELA O BÁRBARO [1-3]
  progression: [
    {
      level: 1,
      pb: 2,
      features: ['rage', 'unarmored_defense'],
      specifics: { rages: 2, rage_damage: 2 },
    },
    {
      level: 2,
      pb: 2,
      features: ['reckless_attack', 'danger_sense'],
      specifics: { rages: 2, rage_damage: 2 },
    },
    {
      level: 3,
      pb: 2,
      features: ['primal_path'], // Escolha do Subclasse (Furioso ou Totêmico)
      specifics: { rages: 3, rage_damage: 2 },
    },
    {
      level: 4,
      pb: 2,
      features: ['asi_4'], // Ability Score Improvement
      specifics: { rages: 3, rage_damage: 2 },
    },
    {
      level: 5,
      pb: 3,
      features: ['extra_attack', 'fast_movement'],
      specifics: { rages: 3, rage_damage: 2 },
    },
    {
      level: 6,
      pb: 3,
      features: ['path_feature_6'], // Feature da subclasse escolhida
      specifics: { rages: 4, rage_damage: 2 },
    },
    {
      level: 7,
      pb: 3,
      features: ['feral_instinct'],
      specifics: { rages: 4, rage_damage: 2 },
    },
    {
      level: 8,
      pb: 3,
      features: ['asi_8'],
      specifics: { rages: 4, rage_damage: 2 },
    },
    {
      level: 9,
      pb: 4,
      features: ['brutal_critical_1'], // +1 dado
      specifics: { rages: 4, rage_damage: 3 },
    },
    {
      level: 10,
      pb: 4,
      features: ['path_feature_10'],
      specifics: { rages: 4, rage_damage: 3 },
    },
    {
      level: 11,
      pb: 4,
      features: ['relentless_rage'],
      specifics: { rages: 4, rage_damage: 3 },
    },
    {
      level: 12,
      pb: 4,
      features: ['asi_12'],
      specifics: { rages: 5, rage_damage: 3 },
    },
    {
      level: 13,
      pb: 5,
      features: ['brutal_critical_2'], // +2 dados
      specifics: { rages: 5, rage_damage: 3 },
    },
    {
      level: 14,
      pb: 5,
      features: ['path_feature_14'],
      specifics: { rages: 5, rage_damage: 3 },
    },
    {
      level: 15,
      pb: 5,
      features: ['persistent_rage'],
      specifics: { rages: 5, rage_damage: 3 },
    },
    {
      level: 16,
      pb: 5,
      features: ['asi_16'],
      specifics: { rages: 5, rage_damage: 4 },
    },
    {
      level: 17,
      pb: 6,
      features: ['brutal_critical_3'], // +3 dados
      specifics: { rages: 6, rage_damage: 4 },
    },
    {
      level: 18,
      pb: 6,
      features: ['indomitable_might'],
      specifics: { rages: 6, rage_damage: 4 },
    },
    {
      level: 19,
      pb: 6,
      features: ['asi_19'],
      specifics: { rages: 6, rage_damage: 4 },
    },
    {
      level: 20,
      pb: 6,
      features: ['primal_champion'],
      specifics: { rages: 99, rage_damage: 4 }, // 99 representa "Ilimitado" [3]
    },
  ],
  subclass_label: '',
};
