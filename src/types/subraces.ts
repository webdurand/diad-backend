export enum SubraceNameEnum {
  // --- ANÃO (Dwarf) ---
  // Fonte: Livro do Jogador [1-3] & Manual dos Monstros [4]
  HILL_DWARF = 'Anão da Colina', // +1 Sabedoria, +1 PV por nível
  MOUNTAIN_DWARF = 'Anão da Montanha', // +2 Força, Armaduras Leves/Médias
  DUERGAR = 'Duergar (Anão Cinzento)', // MM: Invisibilidade, Aumento de Tamanho, Sensibilidade à luz

  // --- ELFO (Elf) ---
  // Fonte: Livro do Jogador [5-8] & Manual dos Monstros [9]
  HIGH_ELF = 'Alto Elfo', // +1 Inteligência, Truque de Mago, Idioma Extra
  WOOD_ELF = 'Elfo da Floresta', // +1 Sabedoria, +1.5m Deslocamento, Esconder na natureza
  DROW = 'Drow (Elfo Negro)', // +1 Carisma, Magia Drow, Sensibilidade à luz

  // --- HALFLING ---
  // Fonte: Livro do Jogador [10, 11]
  LIGHTFOOT_HALFLING = 'Pés-Leves', // +1 Carisma, Furtividade Natural
  STOUT_HALFLING = 'Robusto', // +1 Constituição, Resistência a Veneno

  // --- GNOMO (Gnome) ---
  // Fonte: Livro do Jogador [12] & Manual dos Monstros [13]
  FOREST_GNOME = 'Gnomo da Floresta', // +1 Destreza, Ilusionista Nato, Falar com Bestas
  ROCK_GNOME = 'Gnomo das Rochas', // +1 Constituição, Conhecimento de Artífice
  DEEP_GNOME = 'Gnomo das Profundezas (Svirfneblin)', // MM: Camuflagem Rochosa, Visão no Escuro Superior

  // --- GITH (Raça do Manual dos Monstros) ---
  // Fonte: Manual dos Monstros [14]
  // Gith não aparecem no Livro do Jogador, mas no MM são divididos nestas duas sub-culturas biológicas
  GITHYANKI = 'Githyanki', // Guerreiros astrais, psionismo marcial
  GITHZERAI = 'Githzerai', // Monges do Limbo, psionismo defensivo

  // --- DRACONATO (Dragonborn - Ancestralidade) ---
  // Fonte: Livro do Jogador [15]
  // Tecnicamente é uma "escolha de traço", mas define a biologia (Cor, Resistência e Sopro)
  DRAGONBORN_BLACK = 'Ancestral Negro (Ácido)',
  DRAGONBORN_BLUE = 'Ancestral Azul (Elétrico)',
  DRAGONBORN_BRASS = 'Ancestral Latão (Fogo)',
  DRAGONBORN_BRONZE = 'Ancestral Bronze (Elétrico)',
  DRAGONBORN_COPPER = 'Ancestral Cobre (Ácido)',
  DRAGONBORN_GOLD = 'Ancestral Ouro (Fogo)',
  DRAGONBORN_GREEN = 'Ancestral Verde (Veneno)',
  DRAGONBORN_RED = 'Ancestral Vermelho (Fogo)',
  DRAGONBORN_SILVER = 'Ancestral Prata (Frio)',
  DRAGONBORN_WHITE = 'Ancestral Branco (Frio)',

  // --- HUMANOS & OUTROS ---
  // Fonte: Livro do Jogador [16] & Manual dos Monstros [17]
  HUMAN_STANDARD = 'Humano Padrão', // +1 em todos os atributos
  HUMAN_VARIANT = 'Humano Variante', // +1 em dois atributos, 1 Perícia, 1 Talento (Regra Opcional muito usada)
  KOBOLD_WINGED = 'Kobold Alado (Urd)', // MM: Variação de Kobold que possui asas
}

export type SubraceType = `${SubraceNameEnum}`;
