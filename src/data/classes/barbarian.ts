import { ClassDefinition, ClassNameEnum } from 'src/types/classes';
import { ArmorTypeEnum, WeaponNameEnum, WeaponTypeEnum } from 'src/types/items';
import { SkillNameEnum } from 'src/types/skills';
import { StatNameEnum } from 'src/types/stats';
import { MARTIAL_MELEE_OPTIONS, SIMPLE_WEAPONS_OPTIONS } from '../items';
import { SubclassDefinition } from 'src/types/subclasses';

export const Barbarian: ClassDefinition = {
  id: ClassNameEnum.BARBARIAN,
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

export const BarbarianSubclasses: SubclassDefinition[] = [
  {
    id: 'berserker',
    parent_class_id: ClassNameEnum.BARBARIAN,
    name: 'Caminho do Furioso',
    description:
      'Para alguns bárbaros, a fúria é um meio para um fim – esse fim sendo a morte. O Caminho do Furioso é um caminho de violência desenfreada, carregado de sangue.',
    features: [
      {
        level: 3,
        id: 'frenzy',
        name: 'Frenesi',
        description:
          'Você pode entrar em um frenesi quando entra em fúria. Pela duração da fúria, você pode realizar um único ataque corpo-a-corpo com arma com uma ação bônus em cada um de seus turnos. Ao terminar, você sofre um nível de exaustão.',
      },
      {
        level: 6,
        id: 'mindless_rage',
        name: 'Fúria Inconsciente',
        description:
          'Você não pode ser enfeitiçado ou amedrontado enquanto estiver em fúria. Se você já estiver sob um desses efeitos ao entrar em fúria, o efeito é suspenso pela duração da fúria.',
      },
      {
        level: 10,
        id: 'intimidating_presence',
        name: 'Presença Intimidante',
        description:
          'Você pode usar sua ação para amedrontar alguém com sua presença. Escolha uma criatura a até 9m. Se ela falhar num teste de Sabedoria (CD 8 + prof + Carisma), ficará amedrontada até o fim do próximo turno.',
      },
      {
        level: 14,
        id: 'retaliation',
        name: 'Retaliação',
        description:
          'Quando você sofrer dano de uma criatura que esteja a até 1,5m de você, você pode usar sua reação para realizar um ataque corpo-a-corpo com arma contra essa criatura.',
      },
    ],
  },
  {
    id: 'berserker',
    parent_class_id: ClassNameEnum.BARBARIAN,
    name: 'Caminho do Furioso',
    description:
      'Para alguns bárbaros, a fúria é um meio para um fim – esse fim sendo a morte. O Caminho do Furioso é um caminho de violência desenfreada, carregado de sangue.',
    features: [
      {
        level: 3,
        id: 'frenzy',
        name: 'Frenesi',
        description:
          'Você pode entrar em um frenesi quando entra em fúria. Pela duração da fúria, você pode realizar um único ataque corpo-a-corpo com arma com uma ação bônus em cada um de seus turnos. Ao terminar, você sofre um nível de exaustão.',
      },
      {
        level: 6,
        id: 'mindless_rage',
        name: 'Fúria Inconsciente',
        description:
          'Você não pode ser enfeitiçado ou amedrontado enquanto estiver em fúria. Se você já estiver sob um desses efeitos ao entrar em fúria, o efeito é suspenso pela duração da fúria.',
      },
      {
        level: 10,
        id: 'intimidating_presence',
        name: 'Presença Intimidante',
        description:
          'Você pode usar sua ação para amedrontar alguém com sua presença. Escolha uma criatura a até 9m. Se ela falhar num teste de Sabedoria (CD 8 + prof + Carisma), ficará amedrontada até o fim do próximo turno.',
      },
      {
        level: 14,
        id: 'retaliation',
        name: 'Retaliação',
        description:
          'Quando você sofrer dano de uma criatura que esteja a até 1,5m de você, você pode usar sua reação para realizar um ataque corpo-a-corpo com arma contra essa criatura.',
      },
    ],
  },
  {
    id: 'totem_warrior',
    parent_class_id: ClassNameEnum.BARBARIAN,
    name: 'Caminho do Guerreiro Totêmico',
    description:
      'O Caminho do Guerreiro Totêmico é uma jornada espiritual, a partir do momento que o bárbaro aceita um espírito animal como seu guia, protetor e inspiração. Em batalha, seu espírito totêmico preenche você com força sobrenatural.',
    // Nota: Esta subclasse concede rituais, você pode mapear isso em 'additional_spells' se sua interface suportar
    features: [
      {
        level: 3,
        id: 'spirit_seeker',
        name: 'Buscador Espiritual',
        description:
          'Você ganha a habilidade de conjurar as magias "sentido bestial" e "falar com animais", mas apenas como rituais. [1]',
      },
      {
        level: 3,
        id: 'totem_spirit',
        name: 'Espírito Totêmico',
        description:
          'Você deve escolher um totem animal que lhe concede benefícios enquanto em fúria. [2]',
        choices: {
          type: 'subclass_feature_option',
          amount: 1,
          options: [
            {
              label: 'Urso',
              value: 'bear',
              description:
                'Enquanto em fúria, você tem resistência a todos os danos, exceto psíquico. [3]',
            },
            {
              label: 'Águia',
              value: 'eagle',
              description:
                'Enquanto em fúria, você pode usar a ação de Disparada como ação bônus e ataques de oportunidade contra você têm desvantagem. [2]',
            },
            {
              label: 'Lobo',
              value: 'wolf',
              description:
                'Enquanto em fúria, seus aliados têm vantagem em ataques corpo-a-corpo contra inimigos a até 1,5m de você. [3]',
            },
          ],
        },
      },
      {
        level: 6,
        id: 'aspect_of_the_beast',
        name: 'Aspecto da Besta',
        description:
          'Você adquire um benefício místico baseado no totem que você escolheu. Você pode escolher o mesmo animal do 3º nível ou um diferente. [3]',
        choices: {
          type: 'subclass_feature_option',
          amount: 1,
          options: [
            {
              label: 'Urso',
              value: 'bear',
              description:
                'Sua capacidade de carga é dobrada e você tem vantagem em testes de Força para empurrar, puxar, erguer ou quebrar. [4]',
            },
            {
              label: 'Águia',
              value: 'eagle',
              description:
                'Você enxerga até 1,5km com clareza e não sofre penalidade em testes de Percepção (visão) na penumbra. [2]',
            },
            {
              label: 'Lobo',
              value: 'wolf',
              description:
                'Você pode rastrear em ritmo rápido e se mover furtivamente em ritmo normal. [3]',
            },
          ],
        },
      },
      {
        level: 10,
        id: 'spirit_walker',
        name: 'Andarilho Espiritual',
        description:
          'Você pode conjurar a magia "comunhão com a natureza", mas apenas como um ritual. Uma versão espiritual do seu animal guia aparece para transmitir a informação. [4]',
      },
      {
        level: 14,
        id: 'totemic_attunement',
        name: 'Sintonia Totêmica',
        description:
          'Você ganha um benefício mágico baseado em um totem animal, à sua escolha (pode ser diferente dos anteriores). [5]',
        choices: {
          type: 'subclass_feature_option',
          amount: 1,
          options: [
            {
              label: 'Urso',
              value: 'bear',
              description:
                'Enquanto em fúria, criaturas hostis a 1,5m de você têm desvantagem para atacar outros alvos que não sejam você. [6]',
            },
            {
              label: 'Águia',
              value: 'eagle',
              description:
                'Enquanto em fúria, você adquire deslocamento de voo igual ao seu deslocamento de caminhada. Você cai se terminar o turno no ar. [5]',
            },
            {
              label: 'Lobo',
              value: 'wolf',
              description:
                'Enquanto em fúria, você pode usar uma ação bônus para derrubar uma criatura Grande ou menor quando atingi-la com ataque corpo-a-corpo. [5]',
            },
          ],
        },
      },
    ],
  },
];
