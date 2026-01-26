import { ClassDefinition, ClassNameEnum } from 'src/types/classes';
import {
  ArmorTypeEnum,
  WeaponTypeEnum,
  WeaponNameEnum,
  ArmorNameEnum,
} from 'src/types/items';
import { SkillNameEnum } from 'src/types/skills';
import { StatNameEnum } from 'src/types/stats';
import { SubclassNameEnum } from 'src/types/subclasses';
import { SIMPLE_WEAPONS_OPTIONS } from '../items';

export const WARLOCK_CLASS_DEFINITION: ClassDefinition = {
  id: ClassNameEnum.WARLOCK,
  name: ClassNameEnum.WARLOCK,
  hit_die: 'd8', // [1, 2]
  description:
    'Um portador de magia derivada de barganha com uma entidade planar.', // [1]

  // Subclasses (Patronos) são escolhidas no Nível 1 [3]
  subclasses_available_at_level: 1,
  subclass_label: 'Patrono Transcendental',

  // Requisitos de Multiclasse: Carisma 13 [4]
  multiclass_req: {
    [StatNameEnum.CHARISMA]: 13,
  },

  // Proficiências de Multiclasse: Armaduras leves e armas simples [5]
  multiclass_proficiencies: {
    armor: [ArmorTypeEnum.LIGHT],
    weapons: [WeaponTypeEnum.SIMPLE],
    tools: [],
  },

  // Equipamento Fixo: Armadura de couro, qualquer arma simples e duas adagas [3]
  fixed_equipment: [
    { id: ArmorNameEnum.LEATHER, amount: 1 },
    { id: WeaponNameEnum.DAGGER, amount: 2 },
    ...SIMPLE_WEAPONS_OPTIONS.slice(0, 1).map((weapon) => ({
      id: weapon.value,
      amount: 1,
    })),
  ],

  starting_gold_formula: '4d4 x 10', // [6]

  // Proficiências Iniciais [7]
  proficiencies: {
    armor: [ArmorTypeEnum.LIGHT],
    weapons: [WeaponTypeEnum.SIMPLE],
    tools: [],
    saving_throws: [StatNameEnum.WISDOM, StatNameEnum.CHARISMA],
  },

  // Escolhas de Perícia: Escolha duas [7]
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

  // Escolhas de Equipamento [3, 7]
  equipment_choices: [
    {
      type: 'equipment',
      amount: 1,
      description: 'Arma Principal',
      options: [
        {
          label: 'Besta Leve e 20 virotes',
          value: WeaponNameEnum.LIGHT_CROSSBOW,
          metadata: { ammo_amount: 20 },
        },
        ...SIMPLE_WEAPONS_OPTIONS, // (b) qualquer arma simples
      ],
    },
    {
      type: 'equipment',
      amount: 1,
      description: 'Foco Arcano ou Bolsa de Componentes',
      options: [
        { label: 'Bolsa de Componentes', value: 'component_pouch' },
        { label: 'Foco Arcano', value: 'arcane_focus' },
      ],
    },
    {
      type: 'equipment',
      amount: 1,
      description: 'Pacote de Equipamento',
      options: [
        { label: 'Pacote de Estudioso', value: 'scholars_pack' },
        { label: 'Pacote de Aventureiro', value: 'dungeoneers_pack' }, // Assumindo tradução de Dungeoneer como Aventureiro/Explorador
      ],
    },
  ],

  // Magia de Pacto (Regras especiais de slots)
  spellcasting: {
    ability: StatNameEnum.CHARISMA, // [8]
    preparation_type: 'known', // [9]
    multiplier: 1, // Full caster, embora a mecânica seja diferente
  },

  subclasses: [
    SubclassNameEnum.TheArchfey, // A Arquifada [10]
    SubclassNameEnum.TheFiend, // O Corruptor [11]
    SubclassNameEnum.TheGreatOldOne, // O Grande Antigo [12]
  ],

  // Tabela de Evolução [13]
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
