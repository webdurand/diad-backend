import { ClassDefinition, ClassNameEnum } from 'src/types/classes';
import {
  ArmorTypeEnum,
  WeaponTypeEnum,
  WeaponNameEnum,
  ToolNameEnum,
} from 'src/types/items';
import { SkillNameEnum } from 'src/types/skills';
import { StatNameEnum } from 'src/types/stats';
import { SubclassNameEnum } from 'src/types/subclasses';
import { SIMPLE_WEAPONS_OPTIONS } from '../items';

export const BARD_CLASS_DEFINITION: ClassDefinition = {
  id: ClassNameEnum.BARD,
  name: ClassNameEnum.BARD,
  hit_die: 'd8', // [6]
  description:
    'Um místico inspirador que possui poderes que ecoam a música da criação.', // [7]
  subclasses_available_at_level: 3, // [8]
  subclass_label: 'Colégio de Bardo', // [8]

  // Requisitos de Multiclasse: Carisma 13 [9]

  multiclass_req: {
    [StatNameEnum.CHARISMA]: 13,
  },

  // Proficiências de Multiclasse: Armadura leve, uma perícia, um instrumento [5]

  multiclass_proficiencies: {
    armor: [ArmorTypeEnum.LIGHT],
    weapons: [],
    tools: [], // Nota: O sistema deve permitir escolher 1 instrumento
    skill_amount: 1,
  },

  // Equipamento Fixo: Armadura de couro e uma adaga [10]
  fixed_equipment: [
    { id: 'leather_armor', amount: 1 },

    { id: 'dagger', amount: 1 },
  ],

  starting_gold_formula: '5d4 x 10', // [4]

  // Proficiências Iniciais [6]
  proficiencies: {
    armor: [ArmorTypeEnum.LIGHT],

    weapons: [
      WeaponTypeEnum.SIMPLE,
      WeaponNameEnum.HAND_CROSSBOW,
      WeaponNameEnum.LONGSWORD, // Espadas longas
      WeaponNameEnum.RAPIER, // Rapieiras
      WeaponNameEnum.SHORTSWORD, // Espadas curtas
    ],
    tools: [], // O Bardo escolhe 3 instrumentos musicais (lógica específica de escolha)
    saving_throws: [StatNameEnum.DEXTERITY, StatNameEnum.CHARISMA],
  },

  // Escolhas de Perícia: Escolha três quaisquer [6]

  skill_choices: {
    amount: 3,

    list: [
      SkillNameEnum.ACROBATICS,
      SkillNameEnum.ANIMAL_HANDLING,
      SkillNameEnum.ARCANA,
      SkillNameEnum.ATHLETICS,
      SkillNameEnum.DECEPTION,
      SkillNameEnum.HISTORY,
      SkillNameEnum.INSIGHT,
      SkillNameEnum.INTIMIDATION,
      SkillNameEnum.INVESTIGATION,
      SkillNameEnum.MEDICINE,
      SkillNameEnum.NATURE,
      SkillNameEnum.PERCEPTION,
      SkillNameEnum.PERFORMANCE,
      SkillNameEnum.PERSUASION,
      SkillNameEnum.RELIGION,
      SkillNameEnum.SLEIGHT_OF_HAND,
      SkillNameEnum.STEALTH,
      SkillNameEnum.SURVIVAL,
    ],
  },

  equipment_choices: [
    {
      type: 'equipment',
      amount: 1,
      description: 'Arma Marcial ou Simples',
      options: [
        { label: 'Rapieira', value: WeaponNameEnum.RAPIER },
        { label: 'Espada Longa', value: WeaponNameEnum.LONGSWORD },
        ...SIMPLE_WEAPONS_OPTIONS, // (c) qualquer arma simples
      ],
    },

    {
      type: 'equipment',
      amount: 1,
      description: 'Pacote de Equipamento',
      options: [
        { label: 'Pacote de Diplomata', value: 'diplomats_pack' },
        { label: 'Pacote de Artista', value: 'entertainers_pack' },
      ],
    },

    {
      type: 'equipment',
      amount: 1,
      description: 'Instrumento Musical',
      options: [
        { label: 'Alaúde', value: ToolNameEnum.LUTE },
        {
          label: 'Outro Instrumento Musical',
          value: 'musical_instrument_generic',
        },
      ],
    },
    {
      type: 'tool',
      amount: 3,
      description: 'Instrumentos Musicais',
      options: [
        { label: 'Alaúde', value: ToolNameEnum.LUTE },
        { label: 'Flauta', value: ToolNameEnum.FLUTE },
        // ... usar o spread de uma const MUSICAL_INSTRUMENTS_OPTIONS
      ],
    },
  ],

  // Magia [11]

  spellcasting: {
    ability: StatNameEnum.CHARISMA,
    preparation_type: 'known',
    multiplier: 1,
  },

  subclasses: [
    SubclassNameEnum.CollegeOfValor, // Colégio da Bravura [13]
  ],

  // Tabela de Evolução [14] a [15]
  progression: [
    {
      level: 1,
      pb: 2,
      features: ['spellcasting', 'bardic_inspiration_d6'],
      specifics: {
        cantrips_known: 2,
        spells_known: 4,
        spell_slots: [2, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    },

    {
      level: 2,
      pb: 2,
      features: ['jack_of_all_trades', 'song_of_rest_d6'],
      specifics: {
        cantrips_known: 2,
        spells_known: 5,
        spell_slots: [3, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    },
    {
      level: 3,
      pb: 2,
      features: ['bard_college', 'expertise'],
      specifics: {
        cantrips_known: 2,
        spells_known: 6,
        spell_slots: [4, 2, 0, 0, 0, 0, 0, 0, 0],
      },
    },
    {
      level: 4,
      pb: 2,
      features: ['ability_score_improvement'],
      specifics: {
        cantrips_known: 3,
        spells_known: 7,
        spell_slots: [4, 3, 0, 0, 0, 0, 0, 0, 0],
      },
    },
    {
      level: 5,
      pb: 3,
      features: ['bardic_inspiration_d8', 'font_of_inspiration'],
      specifics: {
        cantrips_known: 3,
        spells_known: 8,
        spell_slots: [4, 3, 2, 0, 0, 0, 0, 0, 0],
      },
    },
    {
      level: 6,
      pb: 3,
      features: ['countercharm', 'bard_college_feature'],
      specifics: {
        cantrips_known: 3,
        spells_known: 9,
        spell_slots: [4, 3, 3, 0, 0, 0, 0, 0, 0],
      },
    },
    {
      level: 7,
      pb: 3,
      features: [],
      specifics: {
        cantrips_known: 3,
        spells_known: 10,
        spell_slots: [4, 3, 3, 1, 0, 0, 0, 0, 0],
      },
    },
    {
      level: 8,
      pb: 3,
      features: ['ability_score_improvement'],
      specifics: {
        cantrips_known: 3,
        spells_known: 11,
        spell_slots: [4, 3, 3, 2, 0, 0, 0, 0, 0],
      },
    },
    {
      level: 9,
      pb: 4,
      features: ['song_of_rest_d8'],
      specifics: {
        cantrips_known: 3,
        spells_known: 12,
        spell_slots: [4, 3, 3, 3, 1, 0, 0, 0, 0],
      },
    },
    {
      level: 10,
      pb: 4,
      features: ['bardic_inspiration_d10', 'expertise', 'magical_secrets'],
      specifics: {
        cantrips_known: 4,
        spells_known: 14,
        spell_slots: [4, 3, 3, 3, 2, 0, 0, 0, 0],
      },
    },
    {
      level: 11,
      pb: 4,
      features: [],
      specifics: {
        cantrips_known: 4,
        spells_known: 15,
        spell_slots: [4, 3, 3, 3, 2, 1, 0, 0, 0],
      },
    },
    {
      level: 12,
      pb: 4,
      features: ['ability_score_improvement'],
      specifics: {
        cantrips_known: 4,
        spells_known: 15,
        spell_slots: [4, 3, 3, 3, 2, 1, 0, 0, 0],
      },
    },
    {
      level: 13,
      pb: 5,
      features: ['song_of_rest_d10'],
      specifics: {
        cantrips_known: 4,
        spells_known: 16,
        spell_slots: [4, 3, 3, 3, 2, 1, 1, 0, 0],
      },
    },
    {
      level: 14,
      pb: 5,
      features: ['magical_secrets', 'bard_college_feature'],
      specifics: {
        cantrips_known: 4,
        spells_known: 18,
        spell_slots: [4, 3, 3, 3, 2, 1, 1, 0, 0],
      },
    },
    {
      level: 15,
      pb: 5,
      features: ['bardic_inspiration_d12'],
      specifics: {
        cantrips_known: 4,
        spells_known: 19,
        spell_slots: [4, 3, 3, 3, 2, 1, 1, 1, 0],
      },
    },

    {
      level: 16,
      pb: 5,
      features: ['ability_score_improvement'],
      specifics: {
        cantrips_known: 4,
        spells_known: 19,
        spell_slots: [4, 3, 3, 3, 2, 1, 1, 1, 0],
      },
    },

    {
      level: 17,
      pb: 6,
      features: ['song_of_rest_d12'],
      specifics: {
        cantrips_known: 4,
        spells_known: 20,
        spell_slots: [4, 3, 3, 3, 2, 1, 1, 1, 1],
      },
    },
    {
      level: 18,
      pb: 6,
      features: ['magical_secrets'],
      specifics: {
        cantrips_known: 4,
        spells_known: 22,
        spell_slots: [4, 3, 3, 3, 3, 1, 1, 1, 1],
      },
    },
    {
      level: 19,
      pb: 6,
      features: ['ability_score_improvement'],
      specifics: {
        cantrips_known: 4,
        spells_known: 22,
        spell_slots: [4, 3, 3, 3, 3, 2, 1, 1, 1],
      },
    },
    {
      level: 20,
      pb: 6,
      features: ['superior_inspiration'],
      specifics: {
        cantrips_known: 4,
        spells_known: 22,
        spell_slots: [4, 3, 3, 3, 3, 2, 2, 1, 1],
      },
    },
  ],
};
