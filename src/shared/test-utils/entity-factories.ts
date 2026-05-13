import {
  HpMethodEnum,
  SpellSourceEnum,
  SpellStatusEnum,
  EquipmentSourceEnum,
  ProficiencyTypeEnum,
  CharacterProficiencySourceEnum,
} from "src/entities/enums";



let idCounter = 0;
function uid(): string {
  return `00000000-0000-0000-0000-${String(++idCounter).padStart(12, "0")}`;
}

export function resetIdCounter(): void {
  idCounter = 0;
}



const CLASS_DATA: Record<string, { hit_die: number; name: string }> = {
  barbarian: { hit_die: 12, name: "Barbarian" },
  bard: { hit_die: 8, name: "Bard" },
  cleric: { hit_die: 8, name: "Cleric" },
  druid: { hit_die: 8, name: "Druid" },
  fighter: { hit_die: 10, name: "Fighter" },
  monk: { hit_die: 8, name: "Monk" },
  paladin: { hit_die: 10, name: "Paladin" },
  ranger: { hit_die: 10, name: "Ranger" },
  rogue: { hit_die: 8, name: "Rogue" },
  sorcerer: { hit_die: 6, name: "Sorcerer" },
  warlock: { hit_die: 8, name: "Warlock" },
  wizard: { hit_die: 6, name: "Wizard" },
};



export function makeClass(slug: string, overrides?: Record<string, unknown>) {
  const data = CLASS_DATA[slug] ?? { hit_die: 8, name: slug };
  const id = uid();
  return {
    id,
    slug,
    name: data.name,
    hit_die: data.hit_die,
    multi_classing: { prerequisites: [] },
    proficiency_choices: {},
    spellcasting: null,
    weapon_mastery_count: 0,
    cantrips_known: 0,
    spells_prepared_count: 0,
    spellbook_count: 0,
    ...overrides,
  };
}

export function makeCharacterClass(
  slug: string,
  level = 1,
  overrides?: Record<string, unknown>,
) {
  const classEntity = makeClass(slug);
  return {
    id: uid(),
    character_id: "char-1",
    class_id: classEntity.id,
    class_level: level,
    order: 1,
    subclass_id: null,
    subclass: null,
    class: classEntity,
    ...overrides,
  };
}

export function makeAbilityScore(slug: string, name?: string) {
  const names: Record<string, string> = {
    str: "Strength",
    dex: "Dexterity",
    con: "Constitution",
    int: "Intelligence",
    wis: "Wisdom",
    cha: "Charisma",
  };
  return {
    id: uid(),
    slug,
    name: name ?? names[slug] ?? slug.toUpperCase(),
    full_name: names[slug] ?? slug,
    description: "",
  };
}

export function makeCharacterAbilityScore(
  slug: string,
  baseScore: number,
  bonus = 0,
) {
  return {
    id: uid(),
    character_id: "char-1",
    ability_score_id: uid(),
    base_score: baseScore,
    bonus,
    ability_score: makeAbilityScore(slug),
  };
}

export function makeCharacterAbilityScores(
  overrides: Partial<Record<string, number>> = {},
) {
  const defaults: Record<string, number> = {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  };
  const scores = { ...defaults, ...overrides };
  return Object.entries(scores).map(([slug, value]) =>
    makeCharacterAbilityScore(slug, value as number),
  );
}

export function makeCharacterState(overrides: Record<string, unknown> = {}) {
  return {
    id: uid(),
    character_id: "char-1",
    current_hp: 10,
    temp_hp: 0,
    max_hp_bonus: 0,
    xp: 0,
    cp: 0,
    sp: 0,
    gp: 0,
    pp: 0,
    death_saves_success: 0,
    death_saves_fail: 0,
    conditions: [],
    spell_slots_used: {},
    hit_dice_used: {},
    feature_uses_used: {},
    ki_points_used: 0,
    exhaustion_level: 0,
    inspiration: false,
    ...overrides,
  };
}

export function makeSpell(
  slug: string,
  level: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: uid(),
    slug,
    name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    level,
    description: [`Description of ${slug}`],
    range: "Self",
    components: { V: true },
    ritual: false,
    duration: "Instantaneous",
    concentration: false,
    casting_time: "1 action",
    attack_type: null,
    damage: null,
    dc: null,
    school: null,
    ...overrides,
  };
}

export function makeCharacterSpell(
  spellSlug: string,
  spellLevel: number,
  status: SpellStatusEnum = SpellStatusEnum.Prepared,
  overrides: Record<string, unknown> = {},
) {
  const spell = makeSpell(spellSlug, spellLevel);
  return {
    id: uid(),
    character_id: "char-1",
    spell_id: spell.id,
    source: SpellSourceEnum.Class,
    status,
    always_prepared: spellLevel === 0,
    spell,
    ...overrides,
  };
}

export function makeEquipment(
  slug: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: uid(),
    slug,
    name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    weight: "0",
    cost: { quantity: 1, unit: "gp" },
    damage: null,
    armor_class: null,
    properties: null,
    range: null,
    description: null,
    consumable_effect: null,
    raw: null,
    ...overrides,
  };
}

export function makeCharacterEquipment(
  equipSlug: string,
  overrides: Record<string, unknown> = {},
) {
  const equipment = makeEquipment(
    equipSlug,
    overrides.equipmentOverrides as Record<string, unknown>,
  );
  const { equipmentOverrides: _, ...rest } = overrides;





  const isWeapon = !!(equipment as { damage?: unknown }).damage;
  const isShield = equipSlug.includes("shield");
  const shouldAutoMainHand =
    isWeapon &&
    !isShield &&
    (rest as { equipped?: boolean }).equipped === true &&
    !("mainHand" in rest) &&
    !("offHand" in rest);
  return {
    id: uid(),
    character_id: "char-1",
    equipment_id: equipment.id,
    quantity: 1,
    equipped: false,
    mainHand: shouldAutoMainHand,
    offHand: false,
    source: EquipmentSourceEnum.Starting,
    equipment,
    ...rest,
  };
}

export function makeFeature(
  slug: string,
  level = 1,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: uid(),
    slug,
    name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    level,
    description: {},
    prerequisites: {},
    ...overrides,
  };
}

export function makeCharacterFeature(
  featureSlug: string,
  classSlug?: string,
  overrides: Record<string, unknown> = {},
) {
  const feature = makeFeature(
    featureSlug,
    1,
    overrides.featureOverrides as Record<string, unknown>,
  );
  const { featureOverrides: _, ...rest } = overrides;
  const sourceClass = classSlug ? makeClass(classSlug) : null;
  return {
    id: uid(),
    character_id: "char-1",
    feature_id: feature.id,
    source_class_id: sourceClass?.id ?? null,
    active: true,
    choices: {},
    feature,
    source_class: sourceClass,
    ...rest,
  };
}

export function makeLevelUp(
  classSlug: string,
  totalLevel: number,
  hpGained: number,
  overrides: Record<string, unknown> = {},
) {
  const classEntity = makeClass(classSlug);
  return {
    id: uid(),
    character_id: "char-1",
    total_level: totalLevel,
    class_id: classEntity.id,
    hp_gained: hpGained,
    hp_method: HpMethodEnum.Fixed,
    choices: {},
    class: classEntity,
    ...overrides,
  };
}

export function makeCharacterSkill(
  skillSlug: string,
  abilitySlug: string,
  expertise = false,
) {
  const skillId = uid();
  const abilityScore = makeAbilityScore(abilitySlug);
  return {
    id: uid(),
    character_id: "char-1",
    skill_id: skillId,
    expertise,
    skill: {
      id: skillId,
      slug: skillSlug,
      name: skillSlug
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      ability_score_id: abilityScore.id,
      ability_score: abilityScore,
    },
  };
}

export function makeCharacterProficiency(
  slug: string,
  type: ProficiencyTypeEnum = ProficiencyTypeEnum.Weapon,
  source: CharacterProficiencySourceEnum = CharacterProficiencySourceEnum.Class,
) {
  const profId = uid();
  return {
    id: uid(),
    character_id: "char-1",
    proficiency_id: profId,
    source,
    proficiency: {
      id: profId,
      slug,
      name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      proficiency_type: type,
    },
  };
}

export function makeCharacter(overrides: Record<string, unknown> = {}) {
  return {
    id: "char-1",
    name: "Test Character",
    userId: "user-1",
    data: {},
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    character_origin: null,
    ...overrides,
  };
}

export function makeCharacterOrigin(overrides: Record<string, unknown> = {}) {
  return {
    id: uid(),
    character_id: "char-1",
    race_id: uid(),
    background_id: uid(),
    alignment_id: null,
    subrace_id: null,
    personality: {},
    species_size: "Medium",
    age: null,
    height: null,
    weight: null,
    ability_score_method: "standard_array",
    race_trait_choices: [],
    race_feat_choice: null,
    divine_order: null,
    primal_order: null,
    fighting_style_index: null,
    class_equipment_choices: [],
    background_equipment_choices: [],
    class_starting_gold: null,
    eldritch_invocations: [],
    eldritch_invocation_sub_choices: null,
    weapon_mastery_choices: [],
    class_language_choices: [],
    class_tool_proficiency: null,
    race: { slug: "human", name: "Human", speed: 30 },
    subrace: null,
    background: { slug: "acolyte", name: "Acolyte" },
    alignment: null,
    ...overrides,
  };
}

export function makeMagicItem(overrides: Record<string, unknown> = {}) {
  return {
    id: uid(),
    slug: "magic-sword",
    name: "Magic Sword",
    rarity: { name: "Uncommon" },
    description: { text: "A magic sword" },
    equipment_category_id: null,
    ...overrides,
  };
}

export function makeCharacterMagicItem(
  overrides: Record<string, unknown> = {},
) {
  const magicItem = makeMagicItem(
    overrides.magicItemOverrides as Record<string, unknown>,
  );
  const { magicItemOverrides: _, ...rest } = overrides;
  return {
    id: uid(),
    character_id: "char-1",
    magic_item_id: magicItem.id,
    attuned: false,
    magic_item: magicItem,
    ...rest,
  };
}

export function makeSpellClass(spellId: string, classId: string) {
  return {
    spell_id: spellId,
    class_id: classId,
  };
}
