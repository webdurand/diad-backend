export enum LanguageNameEnum {
  // --- Linguagens Padrão (Livro do Jogador) ---
  COMMON = 'Comum', // Falado por quase todos
  DWARVISH = 'Anão', // Anões
  ELVISH = 'Élfico', // Elfos
  GIANT = 'Gigante', // Ogros, Gigantes
  GNOMISH = 'Gnômico', // Gnomos
  GOBLIN = 'Goblin', // Goblinoides
  HALFLING = 'Halfling', // Halflings
  ORC = 'Orc', // Orcs

  // --- Linguagens Exóticas (Livro do Jogador) ---
  ABYSSAL = 'Abissal', // Demônios
  CELESTIAL = 'Celestial', // Celestiais
  DRACONIC = 'Dracônico', // Dragões, Draconatos, Kobolds
  DEEP_SPEECH = 'Dialeto Subterrâneo', // Devoradores de Mentes, Beholders
  INFERNAL = 'Infernal', // Diabos, Tieflings
  PRIMORDIAL = 'Primordial', // Elementais
  SYLVAN = 'Silvestre', // Criaturas Feéricas
  UNDERCOMMON = 'Subcomum', // Comerciantes do Subterrâneo, Drow

  // --- Dialetos do Primordial (Mecanicamente falam Primordial) ---
  // Nota: Criaturas que falam um dialeto entendem as outras [1]
  AQUAN = 'Aquan', // Dialeto da Água
  AURAN = 'Auran', // Dialeto do Ar
  IGNAN = 'Ignan', // Dialeto do Fogo
  TERRAN = 'Terran', // Dialeto da Terra

  // --- Linguagens de Classe/Antecedente (Secretas) ---
  DRUIDIC = 'Druídico', // Apenas Druidas (Cap. 3)
  THIEVES_CANT = 'Gíria de Ladrão', // Apenas Ladinos (Cap. 3)

  // --- Linguagens Específicas de Monstros (Manual dos Monstros) ---
  // Estas geralmente não estão disponíveis para jogadores na criação,
  // mas podem ser aprendidas via magia ou treinamento.
  GIANT_EAGLE = 'Águia Gigante', // [2]
  GIANT_ELK = 'Alce Gigante', // [3]
  BULLYWUG = 'Bullywug', // [4]
  BLINK_DOG = 'Cão Teleportador', // [5]
  SPHINX = 'Esfíngico', // [6]
  GITH = 'Gith', // [7]
  GNOLL = 'Gnoll', // [8]
  GRELL = 'Grell', // [9]
  WINTER_WOLF = 'Lobo Invernal', // [10]
  MODRON = 'Modron', // [11]
  OTYUGH = 'Otyugh', // [12]
  SAHUAGIN = 'Sahuagin', // [13]
  SLAAD = 'Slaad', // [14]
  THRI_KREEN = 'Thri-kreen', // [15]
  WORG = 'Worg', // [16]
  YETI = 'Yeti', // [17]
}

export type LanguageType = `${LanguageNameEnum}`;
