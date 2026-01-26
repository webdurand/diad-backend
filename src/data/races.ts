import { LanguageNameEnum } from 'src/types/languages';
import { ChoiceTypeEnum, Race, RaceNameEnum } from 'src/types/races';
import { SubraceNameEnum } from 'src/types/subraces';
import { TraitNameEnum } from 'src/types/traits';
import { SkillNameEnum } from 'src/types/skills';
import { ToolNameEnum } from 'src/types/items';

export const races: Race[] = [
  {
    race: RaceNameEnum.DWARF,
    base_stats: { constitution: 2 },
    speed: 7.5,
    size: 'Medium',
    languages: [LanguageNameEnum.COMMON, LanguageNameEnum.DWARVISH],
    fixed_traits: [
      TraitNameEnum.DARKVISION,
      TraitNameEnum.DWARVEN_RESILIENCE,
      TraitNameEnum.DWARVEN_COMBAT_TRAINING,
      TraitNameEnum.STONE_CUNNING,
    ],
    fixed_skills: [],
    choices: [
      {
        type: ChoiceTypeEnum.TOOL_PROFICIENCY,
        amount: 1,
        options: [
          { label: 'Ferramentas de Ferreiro', value: ToolNameEnum.SMITH_TOOLS },
          {
            label: 'Suprimentos de Cervejeiro',
            value: ToolNameEnum.BREWER_SUPPLIES,
          },
          { label: 'Ferramentas de Pedreiro', value: ToolNameEnum.MASON_TOOLS },
        ],
      },
    ],
    subraces: [
      {
        name: SubraceNameEnum.HILL_DWARF,
        additional_stats: { wisdom: 1 },
        additional_traits: [TraitNameEnum.DWARVEN_TOUGHNESS],
      },
      {
        name: SubraceNameEnum.MOUNTAIN_DWARF,
        additional_stats: { strength: 2 },
        additional_traits: [TraitNameEnum.DWARVEN_ARMOR_TRAINING],
      },
    ],
  },
  {
    race: RaceNameEnum.ELF,
    base_stats: { dexterity: 2 },
    speed: 9.0,
    size: 'Medium',
    languages: [LanguageNameEnum.COMMON, LanguageNameEnum.ELVISH],
    fixed_traits: [
      TraitNameEnum.DARKVISION,
      TraitNameEnum.FEY_ANCESTRY,
      TraitNameEnum.TRANCE,
    ],
    fixed_skills: [SkillNameEnum.PERCEPTION],
    choices: [],
    subraces: [
      {
        name: SubraceNameEnum.HIGH_ELF,
        additional_stats: { intelligence: 1 },
        additional_traits: [
          TraitNameEnum.ELVEN_WEAPON_TRAINING,
          TraitNameEnum.CANTRIP,
        ],
        choices: [
          { type: ChoiceTypeEnum.LANGUAGE, amount: 1, options: 'all' },
          {
            type: ChoiceTypeEnum.CANTRIP,
            amount: 1,
            options: 'all',
            description: 'Truque da lista de Mago',
          },
        ],
      },
      {
        name: SubraceNameEnum.WOOD_ELF,
        additional_stats: { wisdom: 1 },
        override_speed: 10.5,
        additional_traits: [
          TraitNameEnum.ELVEN_WEAPON_TRAINING,
          TraitNameEnum.FLEET_OF_FOOT,
          TraitNameEnum.MASK_OF_THE_WILD,
        ],
      },
      {
        name: SubraceNameEnum.DROW,
        additional_stats: { charisma: 1 },
        additional_traits: [
          TraitNameEnum.SUPERIOR_DARKVISION,
          TraitNameEnum.SUNLIGHT_SENSITIVITY,
          TraitNameEnum.DROW_MAGIC,
          TraitNameEnum.DROW_WEAPON_TRAINING,
        ],
      },
    ],
  },
  {
    race: RaceNameEnum.HALFLING,
    base_stats: { dexterity: 2 },
    speed: 7.5,
    size: 'Small',
    languages: [LanguageNameEnum.COMMON, LanguageNameEnum.HALFLING],
    fixed_traits: [
      TraitNameEnum.LUCKY,
      TraitNameEnum.BRAVE,
      TraitNameEnum.HALFLING_NIMBLENESS,
    ],
    fixed_skills: [],
    choices: [],
    subraces: [
      {
        name: SubraceNameEnum.LIGHTFOOT_HALFLING,
        additional_stats: { charisma: 1 },
        additional_traits: [TraitNameEnum.NATURALLY_STEALTHY],
      },
      {
        name: SubraceNameEnum.STOUT_HALFLING,
        additional_stats: { constitution: 1 },
        additional_traits: [TraitNameEnum.STOUT_RESILIENCE],
      },
    ],
  },
  {
    race: RaceNameEnum.HUMAN,
    base_stats: {
      strength: 1,
      dexterity: 1,
      constitution: 1,
      intelligence: 1,
      wisdom: 1,
      charisma: 1,
    },
    speed: 9.0,
    size: 'Medium',
    languages: [LanguageNameEnum.COMMON],
    fixed_traits: [],
    fixed_skills: [],
    choices: [{ type: ChoiceTypeEnum.LANGUAGE, amount: 1, options: 'all' }],
    subraces: [
      {
        name: SubraceNameEnum.HUMAN_VARIANT,
        override_base_stats: {
          strength: 0,
          dexterity: 0,
          constitution: 0,
          intelligence: 0,
          wisdom: 0,
          charisma: 0,
        },
        additional_stats: {},
        additional_traits: [],
        choices: [
          {
            type: ChoiceTypeEnum.STAT_INCREASE,
            amount: 2,
            options: 'all',
            restriction: { unique: true },
          },
          { type: ChoiceTypeEnum.SKILL_PROFICIENCY, amount: 1, options: 'all' },
          { type: ChoiceTypeEnum.FEAT, amount: 1, options: 'all' },
          { type: ChoiceTypeEnum.LANGUAGE, amount: 1, options: 'all' },
        ],
      },
    ],
  },
  {
    race: RaceNameEnum.DRAGONBORN,
    base_stats: { strength: 2, charisma: 1 },
    speed: 9.0,
    size: 'Medium',
    languages: [LanguageNameEnum.COMMON, LanguageNameEnum.DRACONIC],
    fixed_traits: [
      TraitNameEnum.DRACONIC_ANCESTRY,
      TraitNameEnum.BREATH_WEAPON,
      TraitNameEnum.DAMAGE_RESISTANCE,
    ],
    fixed_skills: [],
    choices: [
      {
        type: ChoiceTypeEnum.DRACONIC_ANCESTRY,
        amount: 1,
        options: [
          {
            label: 'Azul',
            value: 'blue',
            metadata: { element: 'Elétrico', area: 'Linha', save: 'DEX' },
          },
          {
            label: 'Vermelho',
            value: 'red',
            metadata: { element: 'Fogo', area: 'Cone', save: 'DEX' },
          },
          {
            label: 'Verde',
            value: 'green',
            metadata: { element: 'Veneno', area: 'Cone', save: 'CON' },
          },
          {
            label: 'Preto',
            value: 'black',
            metadata: { element: 'Ácido', area: 'Linha', save: 'DEX' },
          },
          {
            label: 'Branco',
            value: 'white',
            metadata: { element: 'Frio', area: 'Cone', save: 'CON' },
          },
          {
            label: 'Latão',
            value: 'brass',
            metadata: { element: 'Fogo', area: 'Linha', save: 'DEX' },
          },
          {
            label: 'Bronze',
            value: 'bronze',
            metadata: { element: 'Elétrico', area: 'Linha', save: 'DEX' },
          },
          {
            label: 'Cobre',
            value: 'copper',
            metadata: { element: 'Ácido', area: 'Linha', save: 'DEX' },
          },
          {
            label: 'Ouro',
            value: 'gold',
            metadata: { element: 'Fogo', area: 'Cone', save: 'DEX' },
          },
          {
            label: 'Prata',
            value: 'silver',
            metadata: { element: 'Frio', area: 'Cone', save: 'CON' },
          },
        ],
      },
    ],
    subraces: [],
  },
  {
    race: RaceNameEnum.GNOME,
    base_stats: { intelligence: 2 },
    speed: 7.5,
    size: 'Small',
    languages: [LanguageNameEnum.COMMON, LanguageNameEnum.GNOMISH],
    fixed_traits: [TraitNameEnum.DARKVISION, TraitNameEnum.GNOME_CUNNING],
    fixed_skills: [],
    choices: [],
    subraces: [
      {
        name: SubraceNameEnum.FOREST_GNOME,
        additional_stats: { dexterity: 1 },
        additional_traits: [
          TraitNameEnum.NATURAL_ILLUSIONIST,
          TraitNameEnum.SPEAK_WITH_SMALL_BEASTS,
        ],
      },
      {
        name: SubraceNameEnum.ROCK_GNOME,
        additional_stats: { constitution: 1 },
        additional_traits: [
          TraitNameEnum.ARTIFICERS_LORE,
          TraitNameEnum.TINKER,
        ],
      },
    ],
  },
  {
    race: RaceNameEnum.HALF_ELF,
    base_stats: { charisma: 2 },
    speed: 9.0,
    size: 'Medium',
    languages: [LanguageNameEnum.COMMON, LanguageNameEnum.ELVISH],
    fixed_traits: [
      TraitNameEnum.DARKVISION,
      TraitNameEnum.FEY_ANCESTRY,
      TraitNameEnum.SKILL_VERSATILITY,
    ],
    fixed_skills: [],
    choices: [
      {
        type: ChoiceTypeEnum.STAT_INCREASE,
        amount: 2,
        options: 'all',
        restriction: { exclude: ['charisma'], unique: true },
      },
      { type: ChoiceTypeEnum.SKILL_PROFICIENCY, amount: 2, options: 'all' },
      { type: ChoiceTypeEnum.LANGUAGE, amount: 1, options: 'all' },
    ],
    subraces: [],
  },
  {
    race: RaceNameEnum.HALF_ORC,
    base_stats: { strength: 2, constitution: 1 },
    speed: 9.0,
    size: 'Medium',
    languages: [LanguageNameEnum.COMMON, LanguageNameEnum.ORC],
    fixed_traits: [
      TraitNameEnum.DARKVISION,
      TraitNameEnum.RELENTLESS_ENDURANCE,
      TraitNameEnum.SAVAGE_ATTACKS,
      TraitNameEnum.MENACING,
    ],
    fixed_skills: [SkillNameEnum.INTIMIDATION],
    choices: [],
    subraces: [],
  },
  {
    race: RaceNameEnum.TIEFLING,
    base_stats: { intelligence: 1, charisma: 2 },
    speed: 9.0,
    size: 'Medium',
    languages: [LanguageNameEnum.COMMON, LanguageNameEnum.INFERNAL],
    fixed_traits: [
      TraitNameEnum.DARKVISION,
      TraitNameEnum.HELLISH_RESISTANCE,
      TraitNameEnum.INFERNAL_LEGACY,
    ],
    fixed_skills: [],
    choices: [],
    subraces: [],
  },
];
