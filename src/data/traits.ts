import { RaceNameEnum } from 'src/types/races';
import { SubraceNameEnum } from 'src/types/subraces';

enum SourceTypeEnum {
  RACE = 'race',
  SUBRACE = 'subrace',
  MONSTER = 'monster',
}

type SourceType = `${SourceTypeEnum}`;

interface TraitDefinition {
  id: string;
  name: string;
  description: string;
  source: {
    type: SourceType;
    name: RaceNameEnum | SubraceNameEnum | string;
  };
}

export const traitsDefinitions: TraitDefinition[] = [
  {
    id: 'darkvision',
    name: 'Visão no Escuro',
    description:
      'Acostumado à vida subterrânea, você tem uma visão superior no escuro e na penumbra. Você enxerga na penumbra a até 18 metros como se fosse luz plena, e no escuro como se fosse na penumbra. Você não pode discernir cores no escuro, apenas tons de cinza.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.DWARF },
  },
  {
    id: 'dwarven_resilience',
    name: 'Resiliência Anã',
    description:
      'Você possui vantagem em testes de resistência contra venenos e resistência contra dano de veneno.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.DWARF },
  },
  {
    id: 'stonecunning',
    name: 'Especialização em Rochas',
    description:
      'Sempre que você realizar um teste de Inteligência (História) relacionado à origem de um trabalho em pedra, você é considerado proficiente na perícia História e adiciona o dobro do seu bônus de proficiência ao teste.',
    source: { type: SourceTypeEnum.SUBRACE, name: SubraceNameEnum.HILL_DWARF },
  },
  {
    id: 'dwarven_armor_training', // Sub-raça: Anão da Montanha
    name: 'Treinamento Anão com Armaduras',
    description: 'Você adquire proficiência em armaduras leves e médias.',
    source: {
      type: SourceTypeEnum.SUBRACE,
      name: SubraceNameEnum.MOUNTAIN_DWARF,
    },
  },
  {
    id: 'dwarven_toughness', // Sub-raça: Anão da Colina (Regra geral 5e, inferida do contexto de sub-raças de PV)
    name: 'Tenacidade Anã',
    description:
      'Seu máximo de pontos de vida aumenta em 1, e aumenta em 1 novamente a cada vez que você sobe de nível.',
    source: {
      type: SourceTypeEnum.SUBRACE,
      name: SubraceNameEnum.HILL_DWARF,
    },
  },

  {
    id: 'keen_senses',
    name: 'Sentidos Aguçados',
    description: 'Você tem proficiência na perícia Percepção.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.ELF },
  },
  {
    id: 'fey_ancestry',
    name: 'Ancestral Feérico',
    description:
      'Você tem vantagem nos testes de resistência para resistir a ser enfeitiçado e magias não podem colocá-lo para dormir.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.ELF },
  },
  {
    id: 'trance',
    name: 'Transe',
    description:
      'Elfos não precisam dormir. Ao invés disso, eles meditam profundamente durante 4 horas por dia. Depois de descansar dessa forma, você ganha os mesmos benefícios que um humano depois de 8 horas de sono.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.ELF },
  },
  {
    id: 'elf_weapon_training',
    name: 'Treinamento Élfico com Armas',
    description:
      'Você possui proficiência com espadas longas, espadas curtas, arcos longos e arcos curtos.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.ELF },
  },
  {
    id: 'mask_of_the_wild', // Sub-raça: Elfo da Floresta
    name: 'Máscara da Natureza',
    description:
      'Você pode tentar se esconder mesmo quando estiver apenas levemente obscurecido por folhagem, chuva forte, neve caindo, névoa e outros fenômenos naturais.',
    source: { type: SourceTypeEnum.SUBRACE, name: SubraceNameEnum.WOOD_ELF },
  },
  {
    id: 'superior_darkvision', // Sub-raça: Drow / Gnomo das Profundezas [5, 8]
    name: 'Visão no Escuro Superior',
    description: 'Sua visão no escuro tem alcance de 36 metros de raio.',
    source: { type: SourceTypeEnum.SUBRACE, name: SubraceNameEnum.DROW },
  },
  {
    id: 'sunlight_sensitivity', // Sub-raça: Drow / Duergar [8, 9]
    name: 'Sensibilidade à Luz Solar',
    description:
      'Você possui desvantagem nas jogadas de ataque e testes de Sabedoria (Percepção) relacionados a visão quando você, o alvo do seu ataque, ou qualquer coisa que você está tentando perceber, esteja sob luz solar direta.',
    source: { type: SourceTypeEnum.SUBRACE, name: SubraceNameEnum.DROW },
  },
  {
    id: 'drow_magic', // Sub-raça: Drow
    name: 'Magia Drow',
    description:
      'Você conhece o truque Globos de Luz. No 3º nível, pode conjurar Fogo das Fadas. No 5º nível, pode conjurar Escuridão. Carisma é sua habilidade de conjuração para essas magias.',
    source: { type: SourceTypeEnum.SUBRACE, name: SubraceNameEnum.DROW },
  },

  // --- HALFLING [Fonte: 48, 50, 51] ---
  {
    id: 'lucky',
    name: 'Sorte',
    description:
      'Quando você rolar um 1 no d20 em uma jogada de ataque, teste de habilidade ou teste de resistência, você pode jogar de novo o dado e deve utilizar o novo resultado.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.HALFLING },
  },
  {
    id: 'brave',
    name: 'Bravura',
    description:
      'Você tem vantagem em testes de resistência contra ficar amedrontado.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.HALFLING },
  },
  {
    id: 'halfling_nimbleness',
    name: 'Agilidade Halfling',
    description:
      'Você pode mover-se através do espaço de qualquer criatura que for de um tamanho maior que o seu.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.HALFLING },
  },
  {
    id: 'naturally_stealthy', // Sub-raça: Pés-Leves
    name: 'Furtividade Natural',
    description:
      'Você pode tentar se esconder mesmo quando possuir apenas a cobertura de uma criatura que for no mínimo um tamanho maior que o seu.',
    source: {
      type: SourceTypeEnum.SUBRACE,
      name: SubraceNameEnum.LIGHTFOOT_HALFLING,
    },
  },
  {
    id: 'stout_resilience', // Sub-raça: Robusto
    name: 'Resiliência dos Robustos',
    description:
      'Você tem vantagem em testes de resistência contra veneno e tem resistência contra dano de veneno.',
    source: {
      type: SourceTypeEnum.SUBRACE,
      name: SubraceNameEnum.STOUT_HALFLING,
    },
  },

  // --- DRACONATO (Dragonborn) [Fonte: 66, 67] ---
  {
    id: 'draconic_ancestry_trait', // Vinculado à escolha da cor
    name: 'Ancestral Dracônico',
    description:
      'Você possui um ancestral dracônico que determina o tipo de dano da sua arma de sopro e da sua resistência.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.DRAGONBORN },
  },
  {
    id: 'breath_weapon',
    name: 'Arma de Sopro',
    description:
      'Você pode usar uma ação para exalar energia destrutiva. O tipo de dano e a área são determinados pelo seu ancestral. O teste de resistência é CD 8 + Con + Prof. O dano é 2d6 (aumenta nos níveis 6, 11 e 16). Recupera com descanso curto ou longo.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.DRAGONBORN },
  },
  {
    id: 'damage_resistance',
    name: 'Resistência a Dano',
    description:
      'Você possui resistência ao tipo de dano associado ao seu ancestral dracônico.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.DRAGONBORN },
  },

  // --- GNOMO [Fonte: 70, 71, 72, 659] ---
  {
    id: 'gnome_cunning',
    name: 'Esperteza Gnômica',
    description:
      'Você possui vantagem em todos os testes de resistência de Inteligência, Sabedoria e Carisma contra magia.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.GNOME },
  },
  {
    id: 'natural_illusionist', // Sub-raça: Floresta
    name: 'Ilusionista Nato',
    description:
      'Você conhece o truque Ilusão Menor. Inteligência é a sua habilidade usada para conjurá-lo.',
    source: {
      type: SourceTypeEnum.SUBRACE,
      name: SubraceNameEnum.FOREST_GNOME,
    },
  },
  {
    id: 'speak_with_small_beasts', // Sub-raça: Floresta
    name: 'Falar com Bestas Pequenas',
    description:
      'Através de sons e gestos, você pode comunicar ideias simples para bestas Pequenas ou menores.',
    source: {
      type: SourceTypeEnum.SUBRACE,
      name: SubraceNameEnum.FOREST_GNOME,
    },
  },
  {
    id: 'artificers_lore', // Sub-raça: Rochas
    name: 'Conhecimento de Artífice',
    description:
      'Sempre que você fizer um teste de Inteligência (História) relacionado a itens mágicos, objetos alquímicos ou tecnológicos, você adiciona o dobro do seu bônus de proficiência.',
    source: { type: SourceTypeEnum.SUBRACE, name: SubraceNameEnum.ROCK_GNOME },
  },
  {
    id: 'tinker', // Sub-raça: Rochas
    name: 'Engenhocas',
    description:
      'Você possui proficiência com ferramentas de engenhoqueiro e pode gastar 1 hora e 10 po em materiais para construir dispositivos mecânicos (brinquedo, isqueiro ou caixa de música).',
    source: { type: SourceTypeEnum.SUBRACE, name: SubraceNameEnum.ROCK_GNOME },
  },
  {
    id: 'stone_camouflage', // Sub-raça: Gnomo das Profundezas (MM p. 171/659)
    name: 'Camuflagem Rochosa',
    description:
      'O gnomo possui vantagem em testes de Destreza (Furtividade) feitos para se esconder em terreno rochoso.',
    source: { type: SourceTypeEnum.SUBRACE, name: SubraceNameEnum.DEEP_GNOME },
  },

  // --- MEIO-ORC (Half-Orc) [Fonte: 77] ---
  {
    id: 'relentless_endurance',
    name: 'Resistência Implacável',
    description:
      'Quando você é reduzido a 0 pontos de vida mas não é completamente morto, você pode voltar para 1 ponto de vida. Você precisa terminar um descanso longo para usar essa característica novamente.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.HALF_ORC },
  },
  {
    id: 'savage_attacks',
    name: 'Ataques Selvagens',
    description:
      'Quando você atinge um ataque crítico com uma arma corpo-a-corpo, você pode rolar um dos dados de dano da arma mais uma vez e adicioná-lo ao dano extra causado pelo acerto crítico.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.HALF_ORC },
  },
  {
    id: 'menacing',
    name: 'Ameaçador',
    description: 'Você ganha proficiência na perícia Intimidação.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.HALF_ORC },
  },

  // --- TIEFLING [Fonte: 81] ---
  {
    id: 'hellish_resistance',
    name: 'Resistência Infernal',
    description: 'Você possui resistência a dano de fogo.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.TIEFLING },
  },
  {
    id: 'infernal_legacy',
    name: 'Legado Infernal',
    description:
      'Você conhece o truque Taumaturgia. No 3º nível, pode conjurar Repreensão Infernal. No 5º nível, pode conjurar Escuridão. Carisma é sua habilidade de conjuração.',
    source: { type: SourceTypeEnum.RACE, name: RaceNameEnum.TIEFLING },
  },

  // --- TRAÇOS EXTRAS DE MONSTROS/SUB-RAÇAS ESPECÍFICAS DO MM ---
  // Fonte: Manual dos Monstros (Duergar, Grimlock, etc.)
  {
    id: 'duergar_resilience', // Sub-raça: Duergar (MM p. 594)
    name: 'Resistência Duergar',
    description:
      'O duergar tem vantagem em testes de resistência contra venenos, magias e ilusões, assim como para resistir a ser enfeitiçado ou paralisado.',
    source: { type: SourceTypeEnum.SUBRACE, name: SubraceNameEnum.DUERGAR },
  },
  {
    id: 'duergar_magic', // Sub-raça: Duergar
    name: 'Magia Duergar',
    description:
      'Permite aumentar de tamanho e ficar invisível (consulte as regras de Duergar).',
    source: { type: SourceTypeEnum.SUBRACE, name: SubraceNameEnum.DUERGAR },
  },
  //   {
  //     id: 'amphibious', // Genérico para Tritões/Povo do Mar/Kuo-toa/Bullywug
  //     name: 'Anfíbio',
  //     description: 'A criatura pode respirar ar e água.',
  //     source: { type: 'monster', name: 'anfíbio' },
  //   },
  //   {
  //     id: 'slippery', // Kuo-toa (MM p. 687)
  //     name: 'Escorregadio',
  //     description:
  //       'Vantagem em testes de habilidade e testes de resistência para escapar de um agarrão.',
  //     source: { type: 'monster', name: 'kuo-toa' },
  //   },
  //   {
  //     id: 'chameleon_carapace', // Thri-kreen (MM p. 823)
  //     name: 'Carapaça de Camaleão',
  //     description:
  //       'Pode mudar a cor da carapaça para combinar com o ambiente, ganhando vantagem em Furtividade.',
  //     source: { type: 'monster', name: 'thri-kreen' },
  //   },
  //   {
  //     id: 'standing_leap', // Thri-kreen (MM p. 823)
  //     name: 'Salto Parado',
  //     description:
  //       'O salto à distância vai até 9m e em altura até 4,5m, com ou sem corrida.',
  //     source: { type: 'monster', name: 'thri-kreen' },
  //   },
];
