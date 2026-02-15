import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CharacterEntity,
  CharacterClassEntity,
  CharacterAbilityScoreEntity,
  CharacterSkillEntity,
  CharacterProficiencyEntity,
  CharacterSpellEntity,
  CharacterEquipmentEntity,
  CharacterMagicItemEntity,
  CharacterStateEntity,
  CharacterLevelUpEntity,
  CharacterFeatureEntity,
  CharacterOriginEntity,
  LevelEntity,
  ClassSavingThrowEntity,
  ClassProficiencyEntity,
  EquipmentCategoryItemEntity,
} from 'src/entities';
import { ProficiencyTypeEnum } from 'src/entities/enums';
import {
  PROF_BONUS_BY_LEVEL,
  XP_THRESHOLDS,
  SPELLCASTING_ABILITY,
  CASTER_SLOT_TYPE,
  FULL_CASTER_SLOTS,
  WARLOCK_SLOTS,
  PROF_TO_CATEGORIES,
} from 'src/shared/srd-constants';

// ---- Response DTOs ----

export interface AbilityScoreBlock {
  slug: string;
  name: string;
  score: number;
  modifier: number;
}

export interface SkillBlock {
  slug: string;
  name: string;
  ability: string;
  proficient: boolean;
  expertise: boolean;
  bonus: number;
}

export interface SavingThrowBlock {
  slug: string;
  name: string;
  proficient: boolean;
  bonus: number;
}

export interface ClassBlock {
  slug: string;
  name: string;
  level: number;
  hitDie: number;
  subclass?: { slug: string; name: string };
  spellcastingAbility?: string;
  spellSaveDc?: number;
  spellAttackBonus?: number;
}

export interface SpellBlock {
  slug: string;
  name: string;
  level: number;
  source: string;
  status: string;
  alwaysPrepared: boolean;
}

export interface SpellSlotBlock {
  level: number;
  total: number;
  used: number;
}

interface ProficiencyBlock {
  slug: string;
  name: string;
  type: string;
  source: string;
}

interface FeatureBlock {
  slug: string;
  name: string;
  level: number;
  description: Record<string, unknown>;
  sourceClass?: string;
  active: boolean;
}

export interface EquipmentBlock {
  id: string;
  slug: string;
  name: string;
  weight: number;
  quantity: number;
  equipped: boolean;
  source: string;
  proficient?: boolean | null;
  damage?: Record<string, unknown>;
  armorClass?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  range?: Record<string, unknown>;
  description?: string;
  cost?: Record<string, unknown>;
  utilize?: Array<Record<string, unknown>>;
  consumableEffect?: Record<string, unknown>;
}

export interface MagicItemBlock {
  id: string;
  slug: string;
  name: string;
  rarity: Record<string, unknown>;
  attuned: boolean;
  description?: Record<string, unknown>;
}

export interface CharacterSheet {
  id: string;
  name: string;

  // Origin
  race: { slug: string; name: string };
  subrace?: { slug: string; name: string };
  background: { slug: string; name: string };
  alignment?: { slug: string; name: string };
  personality: Record<string, string>;
  age?: string;
  height?: string;
  weight?: string;
  speciesSize?: string;
  abilityScoreMethod?: string;

  // Classes
  classes: ClassBlock[];
  totalLevel: number;
  proficiencyBonus: number;

  // Ability scores
  abilityScores: AbilityScoreBlock[];

  // Combat
  maxHp: number;
  currentHp: number;
  tempHp: number;
  armorClass: number;
  initiative: number;
  speed: number;
  hitDice: Array<{ die: number; total: number; used: number }>;
  carryingCapacity: number;

  // Death saves
  deathSaves: { successes: number; failures: number };

  // Skills
  skills: SkillBlock[];
  passivePerception: number;

  // Saving throws
  savingThrows: SavingThrowBlock[];

  // Proficiencies
  proficiencies: ProficiencyBlock[];

  // Features
  features: FeatureBlock[];

  // Spells
  spells: SpellBlock[];
  spellSlots: SpellSlotBlock[];

  // State
  xp: number;
  nextLevelXp: number | null;
  levelUpAvailable: boolean;
  gold: { cp: number; sp: number; gp: number; pp: number };
  conditions: string[];

  // Equipment & Inventory
  equipment: EquipmentBlock[];
  magicItems: MagicItemBlock[];
  totalWeight: number;
  encumbered: boolean;
  attunementSlots: { used: number; max: number };

  // Origin metadata
  originDetails: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class CharacterSheetService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly charClassRepo: Repository<CharacterClassEntity>,
    @InjectRepository(CharacterAbilityScoreEntity)
    private readonly charAbilityRepo: Repository<CharacterAbilityScoreEntity>,
    @InjectRepository(CharacterSkillEntity)
    private readonly charSkillRepo: Repository<CharacterSkillEntity>,
    @InjectRepository(CharacterProficiencyEntity)
    private readonly charProfRepo: Repository<CharacterProficiencyEntity>,
    @InjectRepository(CharacterSpellEntity)
    private readonly charSpellRepo: Repository<CharacterSpellEntity>,
    @InjectRepository(CharacterEquipmentEntity)
    private readonly charEquipRepo: Repository<CharacterEquipmentEntity>,
    @InjectRepository(CharacterMagicItemEntity)
    private readonly charMagicItemRepo: Repository<CharacterMagicItemEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly charStateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CharacterLevelUpEntity)
    private readonly charLevelUpRepo: Repository<CharacterLevelUpEntity>,
    @InjectRepository(CharacterFeatureEntity)
    private readonly charFeatureRepo: Repository<CharacterFeatureEntity>,
    @InjectRepository(CharacterOriginEntity)
    private readonly charOriginRepo: Repository<CharacterOriginEntity>,
    @InjectRepository(LevelEntity)
    private readonly levelRepo: Repository<LevelEntity>,
    @InjectRepository(ClassSavingThrowEntity)
    private readonly classSavingThrowRepo: Repository<ClassSavingThrowEntity>,
    @InjectRepository(ClassProficiencyEntity)
    private readonly classProfRepo: Repository<ClassProficiencyEntity>,
    @InjectRepository(EquipmentCategoryItemEntity)
    private readonly equipCatItemRepo: Repository<EquipmentCategoryItemEntity>,
  ) {}

  async computeSheet(
    userId: string,
    characterId: string,
  ): Promise<CharacterSheet> {
    const character = await this.characterRepo.findOne({
      where: { id: characterId, userId },
    });
    if (!character) {
      throw new NotFoundException('Personagem nao encontrado.');
    }

    // Load all related data in parallel
    const [
      charClasses,
      charAbilities,
      charSkills,
      charProfs,
      charSpells,
      charEquip,
      charMagicItems,
      charState,
      charLevelUps,
      charFeatures,
      charOrigin,
    ] = await Promise.all([
      this.charClassRepo.find({
        where: { character_id: characterId },
        order: { order: 'ASC' },
      }),
      this.charAbilityRepo.find({ where: { character_id: characterId } }),
      this.charSkillRepo.find({
        where: { character_id: characterId },
        relations: ['skill', 'skill.ability_score'],
      }),
      this.charProfRepo.find({ where: { character_id: characterId } }),
      this.charSpellRepo.find({ where: { character_id: characterId } }),
      this.charEquipRepo.find({ where: { character_id: characterId } }),
      this.charMagicItemRepo.find({ where: { character_id: characterId } }),
      this.charStateRepo.findOne({ where: { character_id: characterId } }),
      this.charLevelUpRepo.find({
        where: { character_id: characterId },
        order: { total_level: 'ASC' },
      }),
      this.charFeatureRepo.find({
        where: { character_id: characterId },
        relations: ['source_class'],
      }),
      this.charOriginRepo.findOne({ where: { character_id: characterId } }),
    ]);

    if (!charOrigin) {
      throw new NotFoundException(
        'Dados de origem do personagem nao encontrados.',
      );
    }

    // Total level & proficiency bonus
    const totalLevel = charClasses.reduce((sum, cc) => sum + cc.class_level, 0);
    const profBonus = PROF_BONUS_BY_LEVEL[Math.min(totalLevel, 20)] ?? 2;

    // Ability scores
    const abilityMap = new Map<
      string,
      { score: number; slug: string; name: string }
    >();
    for (const ca of charAbilities) {
      const slug = ca.ability_score.slug;
      abilityMap.set(slug, {
        slug,
        name: ca.ability_score.name,
        score: ca.base_score + ca.bonus,
      });
    }

    const mod = (slug: string) => {
      const entry = abilityMap.get(slug);
      if (!entry) return 0;
      return Math.floor((entry.score - 10) / 2);
    };

    const abilityScores: AbilityScoreBlock[] = [
      'str',
      'dex',
      'con',
      'int',
      'wis',
      'cha',
    ].map((slug) => {
      const entry = abilityMap.get(slug);
      return {
        slug,
        name: entry?.name ?? slug.toUpperCase(),
        score: entry?.score ?? 10,
        modifier: mod(slug),
      };
    });

    // Max HP
    const primaryClass = charClasses[0];
    const conMod = mod('con');
    let maxHp = primaryClass
      ? primaryClass.class.hit_die + conMod
      : 10 + conMod;
    for (const lu of charLevelUps) {
      maxHp += lu.hp_gained;
    }
    maxHp += charState?.max_hp_bonus ?? 0;

    // Speed (from race)
    const speed = charOrigin.race?.speed ?? 30;

    // AC (base: 10 + DEX mod; equipped armor handled in F6)
    const dexMod = mod('dex');
    let armorClass = 10 + dexMod;

    // Check equipped armor & shield
    for (const eq of charEquip) {
      if (!eq.equipped || !eq.equipment?.armor_class) continue;
      const ac = eq.equipment.armor_class as Record<string, unknown>;
      const base = (ac.base as number) ?? 0;
      const dexBonus = ac.dex_bonus as boolean | undefined;
      const maxBonus = ac.max_bonus as number | undefined;

      if (base > 0) {
        if (dexBonus === false) {
          armorClass = base;
        } else if (maxBonus !== undefined) {
          armorClass = base + Math.min(dexMod, maxBonus);
        } else {
          armorClass = base + dexMod;
        }
      } else {
        // Shield: +2
        armorClass += 2;
      }
    }

    // Initiative
    const initiative = dexMod;

    // Saving throws
    const classSavingThrows = await this.getClassSavingThrows(charClasses);
    const savingThrows: SavingThrowBlock[] = [
      'str',
      'dex',
      'con',
      'int',
      'wis',
      'cha',
    ].map((slug) => {
      const proficient = classSavingThrows.has(slug);
      return {
        slug,
        name: abilityMap.get(slug)?.name ?? slug.toUpperCase(),
        proficient,
        bonus: mod(slug) + (proficient ? profBonus : 0),
      };
    });

    // Skills
    const proficientSkillIds = new Set(charSkills.map((s) => s.skill_id));
    const expertiseSkillIds = new Set(
      charSkills.filter((s) => s.expertise).map((s) => s.skill_id),
    );

    const skills: SkillBlock[] = charSkills.map((cs) => {
      const abilitySlug = cs.skill.ability_score?.slug ?? 'dex';
      const isProficient = proficientSkillIds.has(cs.skill_id);
      const isExpertise = expertiseSkillIds.has(cs.skill_id);
      const bonus =
        mod(abilitySlug) +
        (isProficient ? profBonus : 0) +
        (isExpertise ? profBonus : 0);
      return {
        slug: cs.skill.slug,
        name: cs.skill.name,
        ability: abilitySlug,
        proficient: isProficient,
        expertise: isExpertise,
        bonus,
      };
    });

    // Passive Perception
    const perceptionSkill = charSkills.find(
      (s) => s.skill.slug === 'perception',
    );
    const perceptionProficient = !!perceptionSkill;
    const perceptionExpertise = perceptionSkill?.expertise ?? false;
    const passivePerception =
      10 +
      mod('wis') +
      (perceptionProficient ? profBonus : 0) +
      (perceptionExpertise ? profBonus : 0);

    // Hit dice
    const hitDice = charClasses.map((cc) => ({
      die: cc.class.hit_die,
      total: cc.class_level,
      used:
        (charState?.hit_dice_used as Record<string, number>)?.[cc.class.slug] ??
        0,
    }));

    // Carrying capacity & weight
    const strScore = abilityMap.get('str')?.score ?? 10;
    const carryingCapacity = strScore * 15;

    const totalWeight = charEquip.reduce((sum, ce) => {
      const w = parseFloat(ce.equipment.weight) || 0;
      return sum + w * ce.quantity;
    }, 0);
    const encumbered = totalWeight > carryingCapacity;

    // Classes block with spellcasting
    const classes: ClassBlock[] = charClasses.map((cc) => {
      const classSlug = cc.class.slug;
      const scAbility = SPELLCASTING_ABILITY[classSlug];
      const block: ClassBlock = {
        slug: classSlug,
        name: cc.class.name,
        level: cc.class_level,
        hitDie: cc.class.hit_die,
      };
      if (cc.subclass) {
        block.subclass = { slug: cc.subclass.slug, name: cc.subclass.name };
      }
      if (scAbility) {
        block.spellcastingAbility = scAbility;
        block.spellSaveDc = 8 + profBonus + mod(scAbility);
        block.spellAttackBonus = profBonus + mod(scAbility);
      }
      return block;
    });

    // Spells
    const spells: SpellBlock[] = charSpells.map((cs) => ({
      slug: cs.spell.slug,
      name: cs.spell.name,
      level: cs.spell.level,
      source: cs.source,
      status: cs.status,
      alwaysPrepared: cs.always_prepared,
    }));

    // Spell slots
    const spellSlots = this.computeSpellSlots(charClasses, charState);

    // Proficiencies (character-level + class-level)
    const proficiencies: ProficiencyBlock[] = charProfs.map((cp) => ({
      slug: cp.proficiency.slug,
      name: cp.proficiency.name,
      type: cp.proficiency.proficiency_type,
      source: cp.source,
    }));

    // Add class proficiencies that aren't already in character_proficiencies
    const existingProfSlugs = new Set(proficiencies.map((p) => p.slug));
    const classIds = charClasses.map((cc) => cc.class_id);
    if (classIds.length > 0) {
      const classProfs = await this.classProfRepo
        .createQueryBuilder('cp')
        .innerJoinAndSelect('cp.proficiency', 'p')
        .where('cp.class_id IN (:...classIds)', { classIds })
        .getMany();
      for (const cp of classProfs) {
        if (!existingProfSlugs.has(cp.proficiency.slug)) {
          existingProfSlugs.add(cp.proficiency.slug);
          proficiencies.push({
            slug: cp.proficiency.slug,
            name: cp.proficiency.name,
            type: cp.proficiency.proficiency_type,
            source: 'class',
          });
        }
      }
    }

    // Features
    const features: FeatureBlock[] = charFeatures.map((cf) => ({
      slug: cf.feature.slug,
      name: cf.feature.name,
      level: cf.feature.level,
      description: cf.feature.description,
      sourceClass: cf.source_class?.name,
      active: cf.active,
    }));

    // Origin details (misc creation metadata)
    const originDetails: Record<string, unknown> = {
      raceTraitChoices: charOrigin.race_trait_choices,
      raceFeatChoice: charOrigin.race_feat_choice,
      divineOrder: charOrigin.divine_order,
      primalOrder: charOrigin.primal_order,
      fightingStyleIndex: charOrigin.fighting_style_index,
      classEquipmentChoices: charOrigin.class_equipment_choices,
      backgroundEquipmentChoices: charOrigin.background_equipment_choices,
      classStartingGold: charOrigin.class_starting_gold,
      eldritchInvocations: charOrigin.eldritch_invocations,
      eldritchInvocationSubChoices: charOrigin.eldritch_invocation_sub_choices,
      weaponMasteryChoices: charOrigin.weapon_mastery_choices,
      classLanguageChoices: charOrigin.class_language_choices,
      classToolProficiency: charOrigin.class_tool_proficiency,
    };

    // Equipment blocks — resolve proficiency per item
    const equipIds = charEquip.map((ce) => ce.equipment_id);
    let equipCatMap = new Map<string, Set<string>>();
    if (equipIds.length > 0) {
      const catItems = await this.equipCatItemRepo.find({
        where: equipIds.map((eid) => ({ equipment_id: eid })),
        relations: ['category'],
      });
      for (const ci of catItems) {
        let s = equipCatMap.get(ci.equipment_id);
        if (!s) {
          s = new Set();
          equipCatMap.set(ci.equipment_id, s);
        }
        s.add(ci.category.slug);
      }
    }

    // Build proficiency slugs from character profs + class profs (reuse already-loaded data)
    const profSlugs = new Set(
      proficiencies
        .filter(
          (p) =>
            p.type === ProficiencyTypeEnum.Armor ||
            p.type === ProficiencyTypeEnum.Weapon ||
            p.type === ProficiencyTypeEnum.Other,
        )
        .map((p) => p.slug),
    );

    const equipment: EquipmentBlock[] = charEquip.map((ce) => {
      const cats = equipCatMap.get(ce.equipment_id) ?? new Set<string>();
      const proficient = this.isEquipmentProficient(
        ce.equipment.slug,
        cats,
        profSlugs,
      );
      return {
        id: ce.id,
        slug: ce.equipment.slug,
        name: ce.equipment.name,
        weight: parseFloat(ce.equipment.weight) || 0,
        quantity: ce.quantity,
        equipped: ce.equipped,
        source: ce.source,
        proficient,
        damage: ce.equipment.damage ?? undefined,
        armorClass: ce.equipment.armor_class ?? undefined,
        properties: ce.equipment.properties ?? undefined,
        range: ce.equipment.range ?? undefined,
        description: ce.equipment.description ?? undefined,
        cost: ce.equipment.cost ?? undefined,
        utilize:
          (ce.equipment.utilize as unknown as Array<Record<string, unknown>>) ??
          undefined,
        consumableEffect: ce.equipment.consumable_effect ?? undefined,
      };
    });

    // Magic item blocks
    const attunedCount = charMagicItems.filter((mi) => mi.attuned).length;
    const magicItems: MagicItemBlock[] = charMagicItems.map((cmi) => ({
      id: cmi.id,
      slug: cmi.magic_item.slug,
      name: cmi.magic_item.name,
      rarity: cmi.magic_item.rarity,
      attuned: cmi.attuned,
      description: cmi.magic_item.description ?? undefined,
    }));

    return {
      id: character.id,
      name: character.name,

      race: { slug: charOrigin.race.slug, name: charOrigin.race.name },
      subrace: charOrigin.subrace
        ? { slug: charOrigin.subrace.slug, name: charOrigin.subrace.name }
        : undefined,
      background: {
        slug: charOrigin.background.slug,
        name: charOrigin.background.name,
      },
      alignment: charOrigin.alignment
        ? { slug: charOrigin.alignment.slug, name: charOrigin.alignment.name }
        : undefined,
      personality: charOrigin.personality,
      age: charOrigin.age ?? undefined,
      height: charOrigin.height ?? undefined,
      weight: charOrigin.weight ?? undefined,
      speciesSize: charOrigin.species_size ?? undefined,
      abilityScoreMethod: charOrigin.ability_score_method ?? undefined,

      classes,
      totalLevel,
      proficiencyBonus: profBonus,

      abilityScores,

      maxHp,
      currentHp: charState?.current_hp ?? maxHp,
      tempHp: charState?.temp_hp ?? 0,
      armorClass,
      initiative,
      speed,
      hitDice,
      carryingCapacity,

      deathSaves: {
        successes: charState?.death_saves_success ?? 0,
        failures: charState?.death_saves_fail ?? 0,
      },

      skills,
      passivePerception,

      savingThrows,

      proficiencies,

      features,

      spells,
      spellSlots,

      xp: charState?.xp ?? 0,
      nextLevelXp: totalLevel < 20 ? XP_THRESHOLDS[totalLevel] : null,
      levelUpAvailable:
        totalLevel < 20 && (charState?.xp ?? 0) >= XP_THRESHOLDS[totalLevel],
      gold: {
        cp: charState?.cp ?? 0,
        sp: charState?.sp ?? 0,
        gp: charState?.gp ?? 0,
        pp: charState?.pp ?? 0,
      },
      conditions: charState?.conditions ?? [],

      equipment,
      magicItems,
      totalWeight: Math.round(totalWeight * 100) / 100,
      encumbered,
      attunementSlots: { used: attunedCount, max: 3 },

      originDetails,

      createdAt: character.createdAt.toISOString(),
      updatedAt: character.updatedAt.toISOString(),
    };
  }

  private async getClassSavingThrows(
    charClasses: CharacterClassEntity[],
  ): Promise<Set<string>> {
    const classIds = charClasses.map((cc) => cc.class_id);
    if (classIds.length === 0) return new Set();

    const savingThrows = await this.classSavingThrowRepo
      .createQueryBuilder('cst')
      .innerJoinAndSelect('cst.ability_score', 'as')
      .where('cst.class_id IN (:...classIds)', { classIds })
      .getMany();

    return new Set(savingThrows.map((st) => st.ability_score.slug));
  }

  private computeSpellSlots(
    charClasses: CharacterClassEntity[],
    charState: CharacterStateEntity | null,
  ): SpellSlotBlock[] {
    let fullCasterLevels = 0;
    let halfCasterLevels = 0;
    let warlockLevel = 0;

    for (const cc of charClasses) {
      const type = CASTER_SLOT_TYPE[cc.class.slug];
      if (!type) continue;
      if (type === 'full') fullCasterLevels += cc.class_level;
      else if (type === 'half') halfCasterLevels += cc.class_level;
      else if (type === 'pact') warlockLevel = cc.class_level;
    }

    const slotsUsed = (charState?.spell_slots_used ?? {}) as Record<
      string,
      number
    >;

    const result: SpellSlotBlock[] = [];

    // Standard spell slots (multiclass formula)
    const effectiveCasterLevel =
      fullCasterLevels + Math.floor(halfCasterLevels / 2);

    if (effectiveCasterLevel > 0) {
      const slotTable = FULL_CASTER_SLOTS[Math.min(effectiveCasterLevel, 20)];
      if (slotTable) {
        for (let i = 0; i < slotTable.length; i++) {
          result.push({
            level: i + 1,
            total: slotTable[i],
            used: slotsUsed[String(i + 1)] ?? 0,
          });
        }
      }
    }

    // Warlock pact slots (separate tracking)
    if (warlockLevel > 0) {
      const pact = WARLOCK_SLOTS[warlockLevel - 1];
      if (pact) {
        result.push({
          level: pact.level,
          total: pact.slots,
          used: slotsUsed['pact'] ?? 0,
        });
      }
    }

    return result;
  }



  private isEquipmentProficient(
    equipSlug: string,
    categorySlugs: Set<string>,
    profSlugs: Set<string>,
  ): boolean | null {
    const isArmor =
      categorySlugs.has('light-armor') ||
      categorySlugs.has('medium-armor') ||
      categorySlugs.has('heavy-armor') ||
      categorySlugs.has('shields') ||
      categorySlugs.has('shield');

    const isWeapon =
      categorySlugs.has('simple-melee-weapons') ||
      categorySlugs.has('simple-ranged-weapons') ||
      categorySlugs.has('martial-melee-weapons') ||
      categorySlugs.has('martial-ranged-weapons');

    if (!isArmor && !isWeapon) return null;

    // Check individual weapon/armor proficiency by equipment slug
    if (profSlugs.has(equipSlug)) return true;
    // Also try plural form (e.g. "longsword" equip slug vs "longswords" proficiency slug)
    if (profSlugs.has(equipSlug + 's')) return true;

    // Check category-based proficiency
    for (const [profSlug, cats] of Object.entries(PROF_TO_CATEGORIES)) {
      if (profSlugs.has(profSlug) && cats.some((c) => categorySlugs.has(c))) {
        return true;
      }
    }

    return false;
  }
}
