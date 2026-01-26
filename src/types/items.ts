// =============================================================================
// ARMADURAS
// =============================================================================
export enum ArmorTypeEnum {
  LIGHT = 'light',
  MEDIUM = 'medium',
  HEAVY = 'heavy',
  SHIELD = 'shield',
}
export type ArmorType = `${ArmorTypeEnum}`;

export enum ArmorNameEnum {
  PADDED = 'padded',
  LEATHER = 'leather',
  STUDDED_LEATHER = 'studded_leather',
  HIDE = 'hide',
  CHAIN_SHIRT = 'chain_shirt',
  SCALE_MAIL = 'scale_mail',
  BREASTPLATE = 'breastplate',
  HALF_PLATE = 'half_plate',
  RING_MAIL = 'ring_mail',
  CHAIN_MAIL = 'chain_mail',
  SPLINT = 'splint',
  PLATE = 'plate',
  SHIELD = 'shield',
}
export type ArmorName = `${ArmorNameEnum}`;

// =============================================================================
// ARMAS
// =============================================================================
export enum WeaponTypeEnum {
  SIMPLE = 'simple',
  MARTIAL = 'martial',
}
export type WeaponType = `${WeaponTypeEnum}`;

export enum WeaponNameEnum {
  // Simples
  CLUB = 'club',
  DAGGER = 'dagger',
  GREATCLUB = 'greatclub',
  HANDAXE = 'handaxe',
  JAVELIN = 'javelin',
  LIGHT_HAMMER = 'light_hammer',
  MACE = 'mace',
  QUARTERSTAFF = 'quarterstaff',
  SICKLE = 'sickle',
  SPEAR = 'spear',
  LIGHT_CROSSBOW = 'light_crossbow',
  DART = 'dart',
  SHORTBOW = 'shortbow',
  SLING = 'sling',
  // Marciais
  BATTLEAXE = 'battleaxe',
  FLAIL = 'flail',
  GLAIVE = 'glaive',
  GREATAXE = 'greataxe',
  GREATSWORD = 'greatsword',
  HALBERD = 'halberd',
  LANCE = 'lance',
  LONGSWORD = 'longsword',
  MAUL = 'maul',
  MORNINGSTAR = 'morningstar',
  PIKE = 'pike',
  RAPIER = 'rapier',
  SCIMITAR = 'scimitar',
  SHORTSWORD = 'shortsword',
  TRIDENT = 'trident',
  WAR_PICK = 'war_pick',
  WARHAMMER = 'warhammer',
  WHIP = 'whip',
  BLOWGUN = 'blowgun',
  HAND_CROSSBOW = 'hand_crossbow',
  HEAVY_CROSSBOW = 'heavy_crossbow',
  LONGBOW = 'longbow',
  NET = 'net',
}
export type WeaponName = `${WeaponNameEnum}`;

// =============================================================================
// FERRAMENTAS (Consolidado)
// =============================================================================
export enum ToolTypeEnum {
  ARTISAN = 'artisan',
  GAMING = 'gaming',
  MUSICAL = 'musical',
  SPECIAL = 'special',
}
export type ToolType = `${ToolTypeEnum}`;

export enum ToolNameEnum {
  // Artesão
  ALCHEMIST_SUPPLIES = 'alchemist_supplies',
  BREWER_SUPPLIES = 'brewer_supplies',
  CALLIGRAPHER_SUPPLIES = 'calligrapher_supplies',
  CARPENTER_TOOLS = 'carpenter_tools',
  CARTOGRAPHER_TOOLS = 'cartographer_tools',
  COBBLER_TOOLS = 'cobbler_tools',
  COOK_UTENSILS = 'cook_utensils',
  GLASSBLOWER_TOOLS = 'glassblower_tools',
  JEWELER_TOOLS = 'jeweler_tools',
  LEATHERWORKER_TOOLS = 'leatherworker_tools',
  MASON_TOOLS = 'mason_tools',
  PAINTER_SUPPLIES = 'painter_supplies',
  POTTER_TOOLS = 'potter_tools',
  SMITH_TOOLS = 'smith_tools',
  TINKER_TOOLS = 'tinker_tools',
  WEAVER_TOOLS = 'weaver_tools',
  WOODCARVER_TOOLS = 'woodcarver_tools',
  // Jogos
  DICE_SET = 'dice_set',
  DRAGONCHESS_SET = 'dragonchess_set',
  PLAYING_CARD_SET = 'playing_card_set',
  THREE_DRAGON_ANTE_SET = 'three_dragon_ante_set',
  // Instrumentos
  BAGPIPES = 'bagpipes',
  DRUM = 'drum',
  DULCIMER = 'dulcimer',
  FLUTE = 'flute',
  LUTE = 'lute',
  LYRE = 'lyre',
  HORN = 'horn',
  PAN_FLUTE = 'pan_flute',
  SHAWM = 'shawm',
  VIOL = 'viol',
  // Especiais
  DISGUISE_KIT = 'disguise_kit',
  FORGERY_KIT = 'forgery_kit',
  HERBALISM_KIT = 'herbalism_kit',
  NAVIGATOR_TOOLS = 'navigator_tools',
  POISONER_KIT = 'poisoner_kit',
  THIEVES_TOOLS = 'thieves_tools',
}
export type ToolName = `${ToolNameEnum}`;

// =============================================================================
// ITENS GERAIS E PACOTES
// =============================================================================
export enum EquipmentPackNameEnum {
  BURGLARS_PACK = 'burglars_pack',
  DIPLOMATS_PACK = 'diplomats_pack',
  DUNGEONEERS_PACK = 'dungeoneers_pack',
  ENTERTAINERS_PACK = 'entertainers_pack',
  EXPLORERS_PACK = 'explorers_pack',
  PRIESTS_PACK = 'priests_pack',
  SCHOLARS_PACK = 'scholars_pack',
}
export type EquipmentPackName = `${EquipmentPackNameEnum}`;

export enum AdventuringGearNameEnum {
  COMPONENT_POUCH = 'component_pouch',
  ARCANE_FOCUS_CRYSTAL = 'arcane_focus_crystal',
  ARCANE_FOCUS_ORB = 'arcane_focus_orb',
  ARCANE_FOCUS_ROD = 'arcane_focus_rod',
  ARCANE_FOCUS_STAFF = 'arcane_focus_staff',
  ARCANE_FOCUS_WAND = 'arcane_focus_wand',
  HOLY_SYMBOL_AMULET = 'holy_symbol_amulet',
  HOLY_SYMBOL_EMBLEM = 'holy_symbol_emblem',
  HOLY_SYMBOL_RELIQUARY = 'holy_symbol_reliquary',
}
export type AdventuringGearName = `${AdventuringGearNameEnum}`;
