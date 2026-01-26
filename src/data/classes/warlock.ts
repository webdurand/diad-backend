import { ClassDefinition, ClassNameEnum } from 'src/types/classes';
import {
  ArmorTypeEnum,
  WeaponTypeEnum,
  WeaponNameEnum,
  ArmorNameEnum,
  AdventuringGearNameEnum,
  EquipmentPackNameEnum,
} from 'src/types/items';
import { SkillNameEnum } from 'src/types/skills';
import { StatNameEnum } from 'src/types/stats';
import { SubclassDefinition, SubclassNameEnum } from 'src/types/subclasses';
import { SIMPLE_WEAPONS_OPTIONS } from '../items';

export const warlock: ClassDefinition = {
  id: ClassNameEnum.WARLOCK,
  name: ClassNameEnum.WARLOCK,
  hit_die: 'd8',
  description:
    'Um portador de magia derivada de barganha com uma entidade planar.',

  subclasses_available_at_level: 1,
  subclass_label: 'Patrono Transcendental',

  multiclass_req: {
    [StatNameEnum.CHARISMA]: 13,
  },

  multiclass_proficiencies: {
    armor: [ArmorTypeEnum.LIGHT],
    weapons: [WeaponTypeEnum.SIMPLE],
    tools: [],
  },

  // Equipamento Fixo: Armadura de couro, qualquer arma simples e duas adagas
  fixed_equipment: [
    { id: ArmorNameEnum.LEATHER, amount: 1 },
    { id: WeaponNameEnum.DAGGER, amount: 2 },
  ],

  starting_gold_formula: '4d4 x 10',

  proficiencies: {
    armor: [ArmorTypeEnum.LIGHT],
    weapons: [WeaponTypeEnum.SIMPLE],
    tools: [],
    saving_throws: [StatNameEnum.WISDOM, StatNameEnum.CHARISMA],
  },

  skill_choices: {
    amount: 2,
    list: [
      SkillNameEnum.ARCANA,
      SkillNameEnum.DECEPTION,
      SkillNameEnum.HISTORY,
      SkillNameEnum.INTIMIDATION,
      SkillNameEnum.INVESTIGATION,
      SkillNameEnum.NATURE,
      SkillNameEnum.RELIGION,
    ],
  },

  equipment_choices: [
    {
      type: 'equipment',
      amount: 1,
      description: 'Arma Principal',
      options: [
        {
          label: 'Besta Leve e 20 virotes',
          value: WeaponNameEnum.LIGHT_CROSSBOW,
          metadata: { quantity: 1, ammo_amount: 20 },
        },
        ...SIMPLE_WEAPONS_OPTIONS,
      ],
    },
    {
      type: 'equipment',
      amount: 1,
      description: 'Foco Arcano ou Bolsa de Componentes',
      options: [
        {
          label: 'Bolsa de Componentes',
          value: AdventuringGearNameEnum.COMPONENT_POUCH,
        },
        {
          label: 'Foco Arcano (Cajado)',
          value: AdventuringGearNameEnum.ARCANE_FOCUS_STAFF,
        },
        {
          label: 'Foco Arcano (Orbe)',
          value: AdventuringGearNameEnum.ARCANE_FOCUS_ORB,
        },
      ],
    },
    {
      type: 'equipment',
      amount: 1,
      description: 'Pacote de Equipamento',
      options: [
        {
          label: 'Pacote de Estudioso',
          value: EquipmentPackNameEnum.SCHOLARS_PACK,
        },
        {
          label: 'Pacote de Aventureiro',
          value: EquipmentPackNameEnum.DUNGEONEERS_PACK,
        },
      ],
    },
  ],

  spellcasting: {
    ability: StatNameEnum.CHARISMA,
    preparation_type: 'known',
    multiplier: 1,
  },

  subclasses: [
    SubclassNameEnum.TheArchfey,
    SubclassNameEnum.TheFiend,
    SubclassNameEnum.TheGreatOldOne,
  ],

  progression: [
    {
      level: 1,
      pb: 2,
      features: ['pact_magic', 'otherworldly_patron'],
      specifics: {
        cantrips_known: 2,
        spells_known: 2,
        pact_slots: 1,
        slot_level: 1,
        invocations_known: 0,
      },
    },
    {
      level: 2,
      pb: 2,
      features: ['eldritch_invocations'],
      specifics: {
        cantrips_known: 2,
        spells_known: 3,
        pact_slots: 2,
        slot_level: 1,
        invocations_known: 2,
      },
    },
    {
      level: 3,
      pb: 2,
      features: ['pact_boon'],
      specifics: {
        cantrips_known: 2,
        spells_known: 4,
        pact_slots: 2,
        slot_level: 2,
        invocations_known: 2,
      },
    },
    {
      level: 4,
      pb: 2,
      features: ['ability_score_improvement'],
      specifics: {
        cantrips_known: 3,
        spells_known: 5,
        pact_slots: 2,
        slot_level: 2,
        invocations_known: 2,
      },
    },
    {
      level: 5,
      pb: 3,
      features: [],
      specifics: {
        cantrips_known: 3,
        spells_known: 6,
        pact_slots: 2,
        slot_level: 3,
        invocations_known: 3,
      },
    },
    {
      level: 6,
      pb: 3,
      features: ['otherworldly_patron_feature'],
      specifics: {
        cantrips_known: 3,
        spells_known: 7,
        pact_slots: 2,
        slot_level: 3,
        invocations_known: 3,
      },
    },
    {
      level: 7,
      pb: 3,
      features: [],
      specifics: {
        cantrips_known: 3,
        spells_known: 8,
        pact_slots: 2,
        slot_level: 4,
        invocations_known: 4,
      },
    },
    {
      level: 8,
      pb: 3,
      features: ['ability_score_improvement'],
      specifics: {
        cantrips_known: 3,
        spells_known: 9,
        pact_slots: 2,
        slot_level: 4,
        invocations_known: 4,
      },
    },
    {
      level: 9,
      pb: 4,
      features: [],
      specifics: {
        cantrips_known: 3,
        spells_known: 10,
        pact_slots: 2,
        slot_level: 5,
        invocations_known: 5,
      },
    },
    {
      level: 10,
      pb: 4,
      features: ['otherworldly_patron_feature'],
      specifics: {
        cantrips_known: 4,
        spells_known: 10,
        pact_slots: 2,
        slot_level: 5,
        invocations_known: 5,
      },
    },
    {
      level: 11,
      pb: 4,
      features: ['mystic_arcanum_6th'],
      specifics: {
        cantrips_known: 4,
        spells_known: 11,
        pact_slots: 3,
        slot_level: 5,
        invocations_known: 5,
      },
    },
    {
      level: 12,
      pb: 4,
      features: ['ability_score_improvement'],
      specifics: {
        cantrips_known: 4,
        spells_known: 11,
        pact_slots: 3,
        slot_level: 5,
        invocations_known: 6,
      },
    },
    {
      level: 13,
      pb: 5,
      features: ['mystic_arcanum_7th'],
      specifics: {
        cantrips_known: 4,
        spells_known: 12,
        pact_slots: 3,
        slot_level: 5,
        invocations_known: 6,
      },
    },
    {
      level: 14,
      pb: 5,
      features: ['otherworldly_patron_feature'],
      specifics: {
        cantrips_known: 4,
        spells_known: 12,
        pact_slots: 3,
        slot_level: 5,
        invocations_known: 6,
      },
    },
    {
      level: 15,
      pb: 5,
      features: ['mystic_arcanum_8th'],
      specifics: {
        cantrips_known: 4,
        spells_known: 13,
        pact_slots: 3,
        slot_level: 5,
        invocations_known: 7,
      },
    },
    {
      level: 16,
      pb: 5,
      features: ['ability_score_improvement'],
      specifics: {
        cantrips_known: 4,
        spells_known: 13,
        pact_slots: 3,
        slot_level: 5,
        invocations_known: 7,
      },
    },
    {
      level: 17,
      pb: 6,
      features: ['mystic_arcanum_9th'],
      specifics: {
        cantrips_known: 4,
        spells_known: 14,
        pact_slots: 4,
        slot_level: 5,
        invocations_known: 7,
      },
    },
    {
      level: 18,
      pb: 6,
      features: [],
      specifics: {
        cantrips_known: 4,
        spells_known: 14,
        pact_slots: 4,
        slot_level: 5,
        invocations_known: 8,
      },
    },
    {
      level: 19,
      pb: 6,
      features: ['ability_score_improvement'],
      specifics: {
        cantrips_known: 4,
        spells_known: 15,
        pact_slots: 4,
        slot_level: 5,
        invocations_known: 8,
      },
    },
    {
      level: 20,
      pb: 6,
      features: ['eldritch_master'],
      specifics: {
        cantrips_known: 4,
        spells_known: 15,
        pact_slots: 4,
        slot_level: 5,
        invocations_known: 8,
      },
    },
  ],
};

export const WarlockSubclasses: SubclassDefinition[] = [
  {
    id: SubclassNameEnum.TheArchfey,
    parent_class_id: ClassNameEnum.WARLOCK,
    name: 'A Arquifada',
    description:
      'Seu patrono é um senhor ou senhora das fadas, uma criatura de lendas que guarda segredos esquecidos.',
    features: [
      {
        level: 1,
        id: 'fey_presence',
        name: 'Presença Feérica',
        description:
          'Você pode usar sua ação para causar medo ou encanto. Criaturas em um cubo de 3 metros devem passar num teste de Resistência de Sabedoria ou ficarão encantadas ou amedrontadas por você até o final do seu próximo turno.',
      },
      {
        level: 6,
        id: 'misty_escape',
        name: 'Névoa de Fuga',
        description:
          'Ao sofrer dano, você pode usar sua reação para ficar invisível e se teletransportar até 18 metros para um espaço vago que possa ver. Você permanece invisível até o início do seu próximo turno ou até atacar ou conjurar uma magia.',
      },
      {
        level: 10,
        id: 'beguiling_defenses',
        name: 'Defesa Sedutora',
        description:
          'Você é imune a ser encantado. Além disso, quando uma criatura tenta encantar você, você pode usar sua reação para tentar voltar o efeito contra ela.',
      },
      {
        level: 14,
        id: 'dark_delirium',
        name: 'Delírio Sombrio',
        description:
          'Você mergulha uma criatura em um reino ilusório. Ela deve passar num teste de Sabedoria ou ficará encantada ou amedrontada por você (à sua escolha) por 1 minuto ou até sua concentração ser quebrada.',
      },
    ],
    additional_spells: {
      1: ['faerie_fire', 'sleep'],
      3: ['calm_emotions', 'phantasmal_force'],
      5: ['blink', 'plant_growth'],
      7: ['dominate_beast', 'greater_invisibility'],
      9: ['dominate_person', 'seeming'],
    },
  },
  {
    id: SubclassNameEnum.TheFiend,
    parent_class_id: ClassNameEnum.WARLOCK,
    name: 'O Corruptor',
    description:
      'Você realizou um pacto com um corruptor dos planos inferiores, um ser cujos objetivos são o mal e a destruição.',
    features: [
      {
        level: 1,
        id: 'dark_ones_blessing',
        name: 'Bênção do Obscuro',
        description:
          'Quando você reduz uma criatura hostil a 0 pontos de vida, você ganha pontos de vida temporários iguais ao seu modificador de Carisma + seu nível de bruxo.',
      },
      {
        level: 6,
        id: 'dark_ones_own_luck',
        name: 'Sorte do Próprio Obscuro',
        description:
          'Você pode adicionar um d10 a um teste de habilidade ou teste de resistência realizado por você. Você pode fazer isso uma vez por descanso curto ou longo.',
      },
      {
        level: 10,
        id: 'fiendish_resilience',
        name: 'Resistência Demoníaca',
        description:
          'Você pode escolher um tipo de dano para ganhar resistência sempre que finalizar um descanso curto ou longo. Dano de armas mágicas ou de prata ignoram essa resistência.',
      },
      {
        level: 14,
        id: 'hurl_through_hell',
        name: 'Lançar no Inferno',
        description:
          'Ao atingir uma criatura com um ataque, você pode transportá-la instantaneamente através dos planos inferiores. A criatura desaparece e, no final do seu próximo turno, retorna sofrendo 10d10 de dano psíquico (se não for um corruptor).',
      },
    ],
    additional_spells: {
      1: ['burning_hands', 'command'],
      3: ['blindness_deafness', 'scorching_ray'],
      5: ['fireball', 'stinking_cloud'],
      7: ['fire_shield', 'wall_of_fire'],
      9: ['flame_strike', 'hallow'],
    },
  },
  {
    id: SubclassNameEnum.TheGreatOldOne,
    parent_class_id: ClassNameEnum.WARLOCK,
    name: 'O Grande Antigo',
    description:
      'Seu patrono é uma entidade misteriosa cuja natureza é profundamente alheia ao tecido da realidade.',
    features: [
      {
        level: 1,
        id: 'awakened_mind',
        name: 'Mente Desperta',
        description:
          'Você pode se comunicar telepaticamente com qualquer criatura que possa ver a até 9 metros de você, desde que ela conheça pelo menos um idioma.',
      },
      {
        level: 6,
        id: 'entropic_ward',
        name: 'Proteção Entrópica',
        description:
          'Ao sofrer um ataque, você pode usar sua reação para impor desvantagem na jogada de ataque. Se o ataque errar, sua próxima jogada de ataque contra essa criatura tem vantagem.',
      },
      {
        level: 10,
        id: 'thought_shield',
        name: 'Escudo de Pensamentos',
        description:
          'Sua mente não pode ser lida a menos que você permita. Você ganha resistência a dano psíquico e, quando uma criatura causar esse tipo de dano a você, ela sofre a mesma quantidade de dano.',
      },
      {
        level: 14,
        id: 'create_thrall',
        name: 'Criar Lacaio',
        description:
          'Você pode usar sua ação para tocar um humanoide incapacitado. Essa criatura fica encantada por você até que uma magia "Remover Mal e Bem" seja conjurada nela ou você use esta habilidade novamente.',
      },
    ],
    additional_spells: {
      1: ['dissonant_whispers', 'tashas_hideous_laughter'],
      3: ['detect_thoughts', 'phantasmal_force'],
      5: ['clairvoyance', 'sending'],
      7: ['dominate_beast', 'evards_black_tentacles'],
      9: ['dominate_person', 'telekinesis'],
    },
  },
];
