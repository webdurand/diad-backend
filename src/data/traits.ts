import { TraitDefinition } from 'src/types/traits';

export const traitsDefinitions: TraitDefinition[] = [
  {
    id: 'darkvision',
    name: 'Visão no Escuro',
    description:
      'Você enxerga na penumbra a até 18 metros como se fosse luz plena, e no escuro como se fosse na penumbra. Você não pode discernir cores no escuro.',
  },
  {
    id: 'dwarven_resilience',
    name: 'Resiliência Anã',
    description:
      'Vantagem em testes de resistência contra venenos e resistência contra dano de veneno.',
  },
  {
    id: 'stonecunning',
    name: 'Especialização em Rochas',
    description:
      'O dobro do bônus de proficiência em testes de História (Int) relacionados à origem de trabalhos em pedra.',
  },
  {
    id: 'dwarven_combat_training',
    name: 'Treinamento Anão em Combate',
    description:
      'Proficiência com machados de batalha, machadinhas, martelos leves e martelos de guerra.',
  },
  {
    id: 'dwarven_armor_training',
    name: 'Treinamento Anão com Armaduras',
    description: 'Você adquire proficiência em armaduras leves e médias.',
  },
  {
    id: 'dwarven_toughness',
    name: 'Tenacidade Anã',
    description:
      'Seu máximo de PV aumenta em 1, e aumenta em 1 a cada nível seguinte.',
  },
  {
    id: 'keen_senses',
    name: 'Sentidos Aguçados',
    description: 'Você tem proficiência na perícia Percepção.',
  },
  {
    id: 'fey_ancestry',
    name: 'Ancestral Feérico',
    description:
      'Vantagem contra ser enfeitiçado e magias não podem colocá-lo para dormir.',
  },
  {
    id: 'trance',
    name: 'Transe',
    description:
      'Elfos meditam por 4 horas em vez de dormir, obtendo o benefício de 8 horas de sono.',
  },
  {
    id: 'elf_weapon_training',
    name: 'Treinamento Élfico com Armas',
    description:
      'Proficiência com espadas longas, espadas curtas, arcos longos e arcos curtos.',
  },
  {
    id: 'drow_weapon_training',
    name: 'Treinamento Drow com Armas',
    description: 'Proficiência com rapieiras, espadas curtas e bestas de mão.',
  },
  {
    id: 'fleet_of_foot',
    name: 'Pés Ligeiros',
    description: 'Seu deslocamento base de caminhada aumenta para 10,5 metros.',
  },
  {
    id: 'extra_cantrip',
    name: 'Truque',
    description:
      'Você conhece um truque à sua escolha da lista de magias do mago. Inteligência é a sua habilidade de conjuração.',
  },
  {
    id: 'mask_of_the_wild',
    name: 'Máscara da Natureza',
    description:
      'Você pode tentar se esconder mesmo quando estiver apenas levemente obscurecido por fenômenos naturais.',
  },
  {
    id: 'superior_darkvision',
    name: 'Visão no Escuro Superior',
    description: 'Sua visão no escuro tem alcance de 36 metros.',
  },
  {
    id: 'sunlight_sensitivity',
    name: 'Sensibilidade à Luz Solar',
    description:
      'Desvantagem em ataques e Percepção visual sob luz solar direta.',
  },
  {
    id: 'drow_magic',
    name: 'Magia Drow',
    description:
      'Você conhece Globos de Luz. No 3º nível: Fogo das Fadas. No 5º nível: Escuridão.',
  },
  {
    id: 'lucky',
    name: 'Sorte',
    description:
      'Ao rolar um 1 natural no d20, você pode relançar o dado e deve usar o novo resultado.',
  },
  {
    id: 'brave',
    name: 'Bravura',
    description: 'Vantagem em testes de resistência contra ficar amedrontado.',
  },
  {
    id: 'halfling_nimbleness',
    name: 'Agilidade Halfling',
    description:
      'Você pode se mover pelo espaço de qualquer criatura maior que você.',
  },
  {
    id: 'naturally_stealthy',
    name: 'Furtividade Natural',
    description:
      'Você pode tentar se esconder atrás de uma criatura que seja pelo menos um tamanho maior que você.',
  },
  {
    id: 'stout_resilience',
    name: 'Resiliência dos Robustos',
    description: 'Vantagem contra veneno e resistência a dano de veneno.',
  },
  {
    id: 'draconic_ancestry_trait',
    name: 'Ancestral Dracônico',
    description:
      'Define o tipo de dano da sua arma de sopro e sua resistência.',
  },
  {
    id: 'breath_weapon',
    name: 'Arma de Sopro',
    description:
      'Exala energia destrutiva baseada no seu ancestral. Dano 2d6 (escala no nível).',
  },
  {
    id: 'damage_resistance',
    name: 'Resistência a Dano',
    description: 'Resistência ao dano associado ao seu ancestral dracônico.',
  },
  {
    id: 'gnome_cunning',
    name: 'Esperteza Gnômica',
    description: 'Vantagem em testes de Int, Sab e Car contra magia.',
  },
  {
    id: 'natural_illusionist',
    name: 'Ilusionista Nato',
    description: 'Você conhece o truque Ilusão Menor.',
  },
  {
    id: 'speak_with_small_beasts',
    name: 'Falar com Bestas Pequenas',
    description: 'Comunica ideias simples para feras pequenas ou menores.',
  },
  {
    id: 'artificers_lore',
    name: 'Conhecimento de Artífice',
    description:
      'Dobro de proficiência em História (Int) para itens mágicos ou tecnológicos.',
  },
  {
    id: 'tinker',
    name: 'Engenhocas',
    description:
      'Proficiência com ferramentas de engenhoqueiro para construir dispositivos mecânicos.',
  },
  {
    id: 'relentless_endurance',
    name: 'Resistência Implacável',
    description:
      'Ao cair a 0 PV, você pode voltar para 1 PV (1x por descanso longo).',
  },
  {
    id: 'savage_attacks',
    name: 'Ataques Selvagens',
    description:
      'Em um crítico corpo-a-corpo, adicione um dado extra de dano da arma.',
  },
  {
    id: 'menacing',
    name: 'Ameaçador',
    description: 'Proficiência na perícia Intimidação.',
  },
  {
    id: 'hellish_resistance',
    name: 'Resistência Infernal',
    description: 'Resistência a dano de fogo.',
  },
  {
    id: 'infernal_legacy',
    name: 'Legado Infernal',
    description:
      'Conhece Taumaturgia. No 3º nível: Repreensão Infernal. No 5º nível: Escuridão.',
  },
  {
    id: 'skill_versatility',
    name: 'Versatilidade em Perícias',
    description: 'Ganha proficiência em duas perícias à sua escolha.',
  },
];
