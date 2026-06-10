import type { DiegeticRitualDefinition } from "./hidden-layer.types";

export const DIEGETIC_RITUAL_CATALOG: readonly DiegeticRitualDefinition[] = [
  {
    key: "festival",
    displayName: "Festival",
    defaultTone: "jubilant",
    compatibleEmotionalArcs: ["rise", "cinderella", "return"],
    compatibleOutcomeTiers: ["TRIUMPH", "BITTERSWEET"],
    narrativeSeedTemplate:
      "A praça de {{location.name}} se enche de luzes e tambores para o festival. {{pc.name}} caminha entre os celebrantes, ainda sentindo o peso da fase que se encerrou.",
    bannedPhrasesContextual: [],
    isActive: true,
    since: "039",
  },
  {
    key: "funeral",
    displayName: "Funeral",
    defaultTone: "solemn",
    compatibleEmotionalArcs: ["fall", "man-in-hole", "icarus", "oedipus"],
    compatibleOutcomeTiers: ["COSTLY", "FAILURE", "BITTERSWEET"],
    narrativeSeedTemplate:
      "A pira de {{npc.fallen.name}} arde lentamente sob o céu de {{location.name}}. {{pc.name}} fica em silêncio, sem se mover, enquanto a fumaça sobe.",
    bannedPhrasesContextual: [
      "descansem em paz",
      "até nos encontrarmos no além",
      "que sua alma encontre paz",
    ],
    isActive: true,
    since: "039",
  },
  {
    key: "oath",
    displayName: "Juramento",
    defaultTone: "binding",
    compatibleEmotionalArcs: ["rise", "oedipus", "return"],
    compatibleOutcomeTiers: ["TRIUMPH", "BITTERSWEET", "COSTLY"],
    narrativeSeedTemplate:
      "{{pc.name}} fica de pé diante de {{npc.witness.name}}. As palavras do juramento saem antes do pensamento, e algo na sala muda quando elas pousam.",
    bannedPhrasesContextual: ["pelos deuses", "que assim seja", "selado em sangue"],
    isActive: true,
    since: "039",
  },
  {
    key: "return",
    displayName: "Retorno",
    defaultTone: "homecoming",
    compatibleEmotionalArcs: ["return", "cinderella", "rise"],
    compatibleOutcomeTiers: ["TRIUMPH", "BITTERSWEET"],
    narrativeSeedTemplate:
      "O portão de {{location.name}} se abre devagar. {{pc.name}} hesita antes de entrar: a cidade não é mais a mesma, e nem ele.",
    bannedPhrasesContextual: ["lar doce lar", "como antigamente", "nada mudou"],
    isActive: true,
    since: "039",
  },
  {
    key: "departure",
    displayName: "Partida",
    defaultTone: "departure",
    compatibleEmotionalArcs: ["fall", "icarus", "rise"],
    compatibleOutcomeTiers: ["BITTERSWEET", "COSTLY", "TRIUMPH"],
    narrativeSeedTemplate:
      "Os portões de {{location.name}} ficam para trás. {{pc.name}} olha o caminho à frente: não há retorno fácil de onde se vai.",
    bannedPhrasesContextual: ["até logo", "novos horizontes", "uma nova jornada começa"],
    isActive: true,
    since: "039",
  },
  {
    key: "toast",
    displayName: "Brinde",
    defaultTone: "celebratory",
    compatibleEmotionalArcs: ["rise", "cinderella"],
    compatibleOutcomeTiers: ["TRIUMPH", "BITTERSWEET"],
    narrativeSeedTemplate:
      "{{pc.name}} ergue o copo. À mesa, {{npcsAliveAtEnd}} fazem o mesmo. Por um instante, o vinho parece ter peso.",
    bannedPhrasesContextual: ["à nossa", "salve", "que venham os bons tempos"],
    isActive: true,
    since: "039",
  },
  {
    key: "vigil",
    displayName: "Vigília",
    defaultTone: "contemplative",
    compatibleEmotionalArcs: ["man-in-hole", "fall", "oedipus", "return"],
    compatibleOutcomeTiers: ["COSTLY", "BITTERSWEET", "FAILURE"],
    narrativeSeedTemplate:
      "A vela queima até quase o fim. {{pc.name}} fica sentado, olhando o ponto onde {{narrative.beat}} aconteceu. Os pássaros começam a cantar antes do amanhecer.",
    bannedPhrasesContextual: [
      "a noite mais longa",
      "guardião da memória",
      "o silêncio dos justos",
    ],
    isActive: true,
    since: "039",
  },
] as const;
