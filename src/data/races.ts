import { LanguageNameEnum } from 'src/types/languages';
import { Race, RaceNameEnum } from 'src/types/races';
import { SubraceNameEnum } from 'src/types/subraces';

export const races: Race[] = [
  {
    race: RaceNameEnum.DWARF,
    base_stats: { constitution: 2 },
    speed: 7.5,
    size: 'Medium',
    languages: [LanguageNameEnum.COMMON, LanguageNameEnum.DWARVISH],
    fixed_traits: [
      'Visão no Escuro',
      'Resiliência Anã',
      'Treinamento Anão em Combate',
      'Especialização em Rochas',
    ],
    fixed_skills: [],
    choices: [
      {
        type: 'tool_proficiency',
        amount: 1,
        options: [
          { label: 'Ferramentas de Ferreiro', value: 'smith_tools' },
          { label: 'Suprimentos de Cervejeiro', value: 'brewer_supplies' },
          { label: 'Ferramentas de Pedreiro', value: 'mason_tools' },
        ],
      },
    ],
    subraces: [
      {
        name: SubraceNameEnum.HILL_DWARF,
        additional_stats: { wisdom: 1 },
        additional_traits: ['Tenacidade Anã'],
      },
      {
        name: SubraceNameEnum.MOUNTAIN_DWARF,
        additional_stats: { strength: 2 },
        additional_traits: ['Treinamento Anão com Armaduras'],
      },
    ],
  },
  {
    race: RaceNameEnum.ELF,
    base_stats: { dexterity: 2 },
    speed: 9.0,
    size: 'Medium',
    languages: [LanguageNameEnum.COMMON, LanguageNameEnum.ELVISH],
    fixed_traits: ['Visão no Escuro', 'Ancestral Feérico', 'Transe'],
    fixed_skills: ['Percepção'],
    choices: [],
    subraces: [
      {
        name: SubraceNameEnum.HIGH_ELF,
        additional_stats: { intelligence: 1 },
        additional_traits: ['Treinamento Élfico com Armas', 'Truque'],
        choices: [
          { type: 'language', amount: 1, options: 'all' },
          {
            type: 'cantrip',
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
          'Treinamento Élfico com Armas',
          'Pés Ligeiros',
          'Máscara da Natureza',
        ],
      },
      {
        name: SubraceNameEnum.DROW,
        additional_stats: { charisma: 1 },
        additional_traits: [
          'Visão no Escuro Superior',
          'Sensibilidade à Luz Solar',
          'Magia Drow',
          'Treinamento Drow com Armas',
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
    fixed_traits: ['Sorte', 'Bravura', 'Agilidade Halfling'],
    fixed_skills: [],
    choices: [],
    subraces: [
      {
        name: SubraceNameEnum.LIGHTFOOT_HALFLING,
        additional_stats: { charisma: 1 },
        additional_traits: ['Furtividade Natural'],
      },
      {
        name: SubraceNameEnum.STOUT_HALFLING,
        additional_stats: { constitution: 1 },
        additional_traits: ['Resiliência dos Robustos'],
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
    choices: [{ type: 'language', amount: 1, options: 'all' }],
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
            type: 'stat_increase',
            amount: 2,
            options: 'all',
            restriction: { unique: true },
          },
          { type: 'skill_proficiency', amount: 1, options: 'all' },
          { type: 'feat', amount: 1, options: 'all' },
          { type: 'language', amount: 1, options: 'all' },
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
      'Ancestral Dracônico',
      'Arma de Sopro',
      'Resistência a Dano',
    ],
    fixed_skills: [],
    choices: [
      {
        type: 'draconic_ancestry',
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
    fixed_traits: ['Visão no Escuro', 'Esperteza Gnômica'],
    fixed_skills: [],
    choices: [],
    subraces: [
      {
        name: SubraceNameEnum.FOREST_GNOME,
        additional_stats: { dexterity: 1 },
        additional_traits: ['Ilusionista Nato', 'Falar com Bestas Pequenas'],
      },
      {
        name: SubraceNameEnum.ROCK_GNOME,
        additional_stats: { constitution: 1 },
        additional_traits: ['Conhecimento de Artífice', 'Engenhocas'],
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
      'Visão no Escuro',
      'Ancestral Feérico',
      'Versatilidade em Perícias',
    ],
    fixed_skills: [],
    choices: [
      {
        type: 'stat_increase',
        amount: 2,
        options: 'all',
        restriction: { exclude: ['charisma'], unique: true },
      },
      { type: 'skill_proficiency', amount: 2, options: 'all' },
      { type: 'language', amount: 1, options: 'all' },
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
      'Visão no Escuro',
      'Resistência Implacável',
      'Ataques Selvagens',
      'Ameaçador',
    ],
    fixed_skills: ['Intimidação'],
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
      'Visão no Escuro',
      'Resistência Infernal',
      'Legado Infernal',
    ],
    fixed_skills: [],
    choices: [],
    subraces: [],
  },
];
