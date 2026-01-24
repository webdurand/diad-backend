// Categoria da Armadura (para regras de proficiência e cálculo de CA)
export enum ArmorTypeEnum {
  LIGHT = 'light', // Leve (Dex total)
  MEDIUM = 'medium', // Média (Dex máx +2)
  HEAVY = 'heavy', // Pesada (Sem Dex)
  SHIELD = 'shield', // Escudo (+2 CA)
}

export type ArmorType = `${ArmorTypeEnum}`;

// Nomes Específicos das Armaduras (IDs para o banco de dados)
export enum ArmorNameEnum {
  // --- Leves ---
  PADDED = 'padded', // Acolchoada
  LEATHER = 'leather', // Couro
  STUDDED_LEATHER = 'studded_leather', // Couro Batido

  // --- Médias ---
  HIDE = 'hide', // Gibão de Peles
  CHAIN_SHIRT = 'chain_shirt', // Camisão de Malha
  SCALE_MAIL = 'scale_mail', // Brunea
  BREASTPLATE = 'breastplate', // Peitoral
  HALF_PLATE = 'half_plate', // Meia-Armadura

  // --- Pesadas ---
  RING_MAIL = 'ring_mail', // Cota de Anéis
  CHAIN_MAIL = 'chain_mail', // Cota de Malha
  SPLINT = 'splint', // Cota de Talas
  PLATE = 'plate', // Placas

  // --- Escudo ---
  SHIELD = 'shield', // Escudo
}

// =============================================================================
// ARMAS (Weapons) - Fonte: Livro do Jogador, Cap. 5
// =============================================================================

// Categoria da Arma (para regras de proficiência)
export enum WeaponTypeEnum {
  SIMPLE = 'simple', // Simples Corpo-a-Corpo
  MARTIAL = 'martial', // Marcial à Distância
}

export type WeaponType = `${WeaponTypeEnum}`;

// Nomes Específicos das Armas
export enum WeaponNameEnum {
  // --- Simples Corpo-a-Corpo ---
  CLUB = 'club', // Porrete
  DAGGER = 'dagger', // Adaga
  GREATCLUB = 'greatclub', // Clava Grande
  HANDAXE = 'handaxe', // Machadinha
  JAVELIN = 'javelin', // Azagaia
  LIGHT_HAMMER = 'light_hammer', // Martelo Leve
  MACE = 'mace', // Maça
  QUARTERSTAFF = 'quarterstaff', // Bordão
  SICKLE = 'sickle', // Foice Curta
  SPEAR = 'spear', // Lança

  // --- Simples à Distância ---
  LIGHT_CROSSBOW = 'light_crossbow', // Besta Leve
  DART = 'dart', // Dardo
  SHORTBOW = 'shortbow', // Arco Curto
  SLING = 'sling', // Funda

  // --- Marciais Corpo-a-Corpo ---
  BATTLEAXE = 'battleaxe', // Machado de Batalha
  FLAIL = 'flail', // Mangual
  GLAIVE = 'glaive', // Glaive
  GREATAXE = 'greataxe', // Machado Grande
  GREATSWORD = 'greatsword', // Espada Grande
  HALBERD = 'halberd', // Alabarda
  LANCE = 'lance', // Lança de Montaria
  LONGSWORD = 'longsword', // Espada Longa
  MAUL = 'maul', // Malho
  MORNINGSTAR = 'morningstar', // Maça Estrela
  PIKE = 'pike', // Lança Longa
  RAPIER = 'rapier', // Rapieira
  SCIMITAR = 'scimitar', // Cimitarra
  SHORTSWORD = 'shortsword', // Espada Curta
  TRIDENT = 'trident', // Tridente
  WAR_PICK = 'war_pick', // Picareta de Guerra
  WARHAMMER = 'warhammer', // Martelo de Guerra
  WHIP = 'whip', // Chicote

  // --- Marciais à Distância ---
  BLOWGUN = 'blowgun', // Zarabatana
  HAND_CROSSBOW = 'hand_crossbow', // Besta de Mão
  HEAVY_CROSSBOW = 'heavy_crossbow', // Besta Pesada
  LONGBOW = 'longbow', // Arco Longo
  NET = 'net', // Rede
}

// =============================================================================
// FERRAMENTAS (Tools) - Fonte: Livro do Jogador, Cap. 5
// =============================================================================

export enum ToolTypeEnum {
  ARTISAN = 'artisan', // Ferramentas de Artesão
  GAMING = 'gaming', // Kits de Jogo
  MUSICAL = 'musical', // Instrumentos Musicais
  SPECIAL = 'special', // Kits Especiais (Ladrão, Navegação, etc)
}

export type ToolType = `${ToolTypeEnum}`;

export enum ToolNameEnum {
  // --- Ferramentas de Artesão ---
  ALCHEMIST_SUPPLIES = 'alchemist_supplies', // Suprimentos de Alquimista
  BREWER_SUPPLIES = 'brewer_supplies', // Suprimentos de Cervejeiro
  CALLIGRAPHER_SUPPLIES = 'calligrapher_supplies', // Suprimentos de Caligrafia
  CARPENTER_TOOLS = 'carpenter_tools', // Ferramentas de Carpinteiro
  CARTOGRAPHER_TOOLS = 'cartographer_tools', // Ferramentas de Cartógrafo
  COBBLER_TOOLS = 'cobbler_tools', // Ferramentas de Sapateiro
  COOK_UTENSILS = 'cook_utensils', // Utensílios de Cozinheiro
  GLASSBLOWER_TOOLS = 'glassblower_tools', // Ferramentas de Vidreiro
  JEWELER_TOOLS = 'jeweler_tools', // Ferramentas de Joalheiro
  LEATHERWORKER_TOOLS = 'leatherworker_tools', // Ferramentas de Coureiro
  MASON_TOOLS = 'mason_tools', // Ferramentas de Pedreiro
  PAINTER_SUPPLIES = 'painter_supplies', // Suprimentos de Pintor
  POTTER_TOOLS = 'potter_tools', // Ferramentas de Oleiro
  SMITH_TOOLS = 'smith_tools', // Ferramentas de Ferreiro
  TINKER_TOOLS = 'tinker_tools', // Ferramentas de Funileiro
  WEAVER_TOOLS = 'weaver_tools', // Ferramentas de Tecelão
  WOODCARVER_TOOLS = 'woodcarver_tools', // Ferramentas de Entalhador

  // --- Kits de Jogo ---
  DICE_SET = 'dice_set', // Conjunto de Dados
  DRAGONCHESS_SET = 'dragonchess_set', // Xadrez do Dragão
  PLAYING_CARD_SET = 'playing_card_set', // Baralho de Cartas
  THREE_DRAGON_ANTE_SET = 'three_dragon_ante_set', // Jogo dos Três Dragões

  // --- Instrumentos Musicais ---
  BAGPIPES = 'bagpipes', // Gaita de Foles
  DRUM = 'drum', // Tambor
  DULCIMER = 'dulcimer', // Lira (ou Dulcimer)
  FLUTE = 'flute', // Flauta
  LUTE = 'lute', // Alaúde
  LYRE = 'lyre', // Lira
  HORN = 'horn', // Trombeta
  PAN_FLUTE = 'pan_flute', // Flauta de Pã
  SHAWM = 'shawm', // Oboé
  VIOL = 'viol', // Violino

  // --- Especiais ---
  DISGUISE_KIT = 'disguise_kit', // Kit de Disfarce
  FORGERY_KIT = 'forgery_kit', // Kit de Falsificação
  HERBALISM_KIT = 'herbalism_kit', // Kit de Herbalismo
  NAVIGATOR_TOOLS = 'navigator_tools', // Ferramentas de Navegador
  POISONER_KIT = 'poisoner_kit', // Kit de Venenos
  THIEVES_TOOLS = 'thieves_tools', // Ferramentas de Ladrão
  VEHICLES_LAND = 'vehicles_land', // Veículos (Terrestres)
  VEHICLES_WATER = 'vehicles_water', // Veículos (Aquáticos)
}
