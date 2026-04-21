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
  SkillEntity,
} from 'src/entities';
import { ProficiencyTypeEnum } from 'src/entities/enums';
import {
  PROF_BONUS_BY_LEVEL,
  XP_THRESHOLDS,
  FULL_CASTER_SLOTS,
  WARLOCK_SLOTS,
  getSpellcastingAbility,
  getCasterSlotType,
  normalizeClassSlug,
} from 'src/shared/srd-constants';
import { getAbilityModifier, isEquipmentProficient, DRACONIC_ANCESTRY_MAP } from 'src/shared/srd-utils';
import type { EquipmentArmorClass } from 'src/shared/equipment-types';

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
  /**
   * Spec 012 #3 — distingue slot Pact Magic (Warlock) de slot padrão.
   * Pact slot é chaveado por 'pact' em charState.spell_slots_used,
   * enquanto standard slot é chaveado pelo nível numérico. Consumidores
   * (spell-casting.service) precisam dessa info pra invocar
   * updateSpellSlots com level=-1 convention.
   */
  kind?: 'standard' | 'pact';
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

  // Ki (Monk)
  kiPoints?: { total: number; used: number };

  // State
  xp: number;
  nextLevelXp: number | null;
  levelUpAvailable: boolean;
  gold: { cp: number; sp: number; gp: number; pp: number };
  conditions: string[];
  exhaustionLevel: number;
  inspiration: boolean;
  /** Fighting Style Blind Fighting (RAW 2024) — blindsight 10ft passiva. */
  hasBlindsight10ft?: boolean;
  /**
   * Champion L3 Remarkable Athlete (RAW 2024) — advantage em STR (Athletics).
   * Pós-crit: move ½ speed sem OA (rider).
   */
  hasRemarkableAthlete?: boolean;
  /**
   * Champion L10 Heroic Warrior (RAW 2024) — start-turn sem inspiration ganha 1.
   */
  hasHeroicWarrior?: boolean;
  /**
   * Champion L18 Survivor (RAW 2024) — death save advantage (18-20 auto success)
   * + regen 5+CON se Bloodied com > 0 HP no start-turn.
   */
  hasSurvivor?: boolean;

  /** Barbarian L2 Danger Sense (RAW 2024) — advantage em DEX save vs effects visíveis (não Incapacitated). */
  hasDangerSense?: boolean;
  /** Barbarian L3 Primal Knowledge (RAW 2024) — pode usar STR pra checks que usariam outra ability. */
  hasPrimalKnowledge?: boolean;
  /** Barbarian L5 Fast Movement (RAW 2024) — +10ft speed quando não usa Heavy Armor. */
  hasFastMovement?: boolean;
  /** Barbarian L7 Feral Instinct (RAW 2024) — advantage initiative + não Surprised se pode agir. */
  hasFeralInstinct?: boolean;
  /** Barbarian L7 Instinctive Pounce (RAW 2024) — ao ativar Rage via BA, move ½ speed grátis. */
  hasInstinctivePounce?: boolean;
  /** Barbarian L9 Brutal Strike (RAW 2024) — abrir mão da adv do Reckless → +1d10 + option. L13+: 2 options, L17+: 2d10. */
  hasBrutalStrike?: boolean;
  /** Barbarian L11 Relentless Rage (RAW 2024) — 0 HP com Rage ativo → CON save DC 10 (+5 cada vez) volta 1 HP. */
  hasRelentlessRage?: boolean;
  /** Barbarian L15 Persistent Rage (RAW 2024) — Rage só termina se Incapacitated OU voluntário. */
  hasPersistentRage?: boolean;
  /** Barbarian L18 Indomitable Might (RAW 2024) — STR check/save floor = STR score. */
  hasIndomitableMight?: boolean;
  /** Barbarian L20 Primal Champion (RAW 2024) — STR/CON +4 com cap 25. */
  hasPrimalChampion?: boolean;

  /** Berserker L3 Frenzy (RAW 2024) — Reckless+Rage primeiro hit → +Nd6 bonus damage. */
  hasFrenzy?: boolean;
  /** Berserker L6 Mindless Rage (RAW 2024) — immune Charmed/Frightened while raging. */
  hasMindlessRage?: boolean;
  /** Berserker L10 Retaliation (RAW 2024) — reaction ao tomar dano 5ft, melee attack free. */
  hasRetaliation?: boolean;
  /** Berserker L14 Intimidating Presence (RAW 2024) — Bonus action 30ft emanation, WIS save → Frightened 1min. */
  hasIntimidatingPresence?: boolean;

  /** Cleric L1 Divine Order (RAW 2024) — escolha Protector (heavy+martial) OR Thaumaturge (+cantrip+religion). Flag existência; choice fica em originDetails. */
  hasDivineOrder?: boolean;
  /** Cleric L2 Channel Divinity (RAW 2024) — pool reset short rest. Uses: 1 (L2), 2 (L6), 3 (L18). */
  hasChannelDivinity?: boolean;
  /** Cleric L2 Turn Undead (RAW 2024) — CD option universal. Magic action 30ft WIS save → Frightened 1min. */
  hasTurnUndead?: boolean;
  /** Cleric L5 Sear Undead (RAW 2024, substitui Destroy Undead 2014) — CD scaling damage 10+5×(level-5) radiant, CON save half. */
  hasSearUndead?: boolean;
  /** Cleric L7 Blessed Strikes (RAW 2024, substitui Divine Strike/Potent Spellcasting 2014) — 1/turn melee hit OR cantrip save → +1d8 radiant. */
  hasBlessedStrikes?: boolean;
  /** Cleric L14 Improved Blessed Strikes (RAW 2024) — +2d8 radiant. */
  hasImprovedBlessedStrikes?: boolean;
  /** Cleric L10 Divine Intervention (RAW 2024) — Magic action, cast spell via divindade, auto-sucesso, cap nível do slot gasto. */
  hasDivineIntervention?: boolean;
  /** Cleric L20 Greater Divine Intervention (RAW 2024) — sem CD cost, recharge 2d4 long rests. */
  hasGreaterDivineIntervention?: boolean;

  /** Cleric Life Domain L1 Disciple of Life — cura spells +2+slot HP. */
  hasDiscipleOfLife?: boolean;
  /** Cleric Life Domain L2 Preserve Life — CD pool 5×level HP dividido entre aliados 30ft. */
  hasPreserveLife?: boolean;
  /** Cleric Life Domain L6 Blessed Healer — heal others → self heal 2+slot. */
  hasBlessedHealer?: boolean;
  /** Cleric Life Domain L17 Supreme Healing — max dice heals (em vez de roll). */
  hasSupremeHealing?: boolean;
  /** Cleric Light Domain L3 Warding Flare — reaction disadvantage WIS/LR. */
  hasWardingFlare?: boolean;
  /** Cleric Light Domain L3 Radiance of the Dawn — CD 30ft nova radiant. */
  hasRadianceOfTheDawn?: boolean;
  /** Cleric Trickery Domain L3 Invoke Duplicity — CD illusion duplicate 1min. */
  hasInvokeDuplicity?: boolean;
  /** Cleric War Domain L3 War Priest — Attack action → Bonus extra attack. */
  hasWarPriest?: boolean;
  /** Cleric War Domain L3 Guided Strike — CD +10 attack bonus after seeing d20. */
  hasGuidedStrike?: boolean;

  // Equipment & Inventory
  equipment: EquipmentBlock[];
  magicItems: MagicItemBlock[];
  totalWeight: number;
  encumbered: boolean;
  attunementSlots: { used: number; max: number };

  // Origin metadata
  originDetails: Record<string, unknown>;

  // Source / Ruleset
  source?: { code: string; name: string };

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
    @InjectRepository(SkillEntity)
    private readonly skillRepo: Repository<SkillEntity>,
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
      return getAbilityModifier(entry.score);
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

    // Speed (from race) + Barbarian Fast Movement L5 rider
    let speed = charOrigin.race?.speed ?? 30;
    const hasFastMovementFeat = charFeatures.some((cf) =>
      (cf.feature?.slug ?? '').startsWith('fast-movement'),
    );
    if (hasFastMovementFeat) {
      // RAW 2024: Fast Movement +10ft enquanto não usa Heavy Armor.
      const heavyArmorSlugs = new Set(['chain-mail', 'splint', 'plate', 'ring-mail']);
      const heavyArmorEquipped = charEquip.some(
        (eq) =>
          eq.equipped &&
          heavyArmorSlugs.has((eq.equipment?.slug ?? '').toLowerCase()),
      );
      if (!heavyArmorEquipped) speed += 10;
    }

    // AC calculation
    const dexMod = mod('dex');

    // Step 1: Determine armor AC and whether shield is equipped.
    // Shield é identificado por slug/name (SRD o marca como armor com base=2),
    // não por base=0 — senão o shield sobrescreve o armor equipado.
    let armorAc: number | null = null;
    let hasShield = false;
    for (const eq of charEquip) {
      if (!eq.equipped || !eq.equipment?.armor_class) continue;
      const slug = (eq.equipment.slug ?? '').toLowerCase();
      const name = (eq.equipment.name ?? '').toLowerCase();
      const isShield = slug === 'shield' || name === 'shield';
      if (isShield) {
        hasShield = true;
        continue;
      }
      const ac = eq.equipment.armor_class as unknown as EquipmentArmorClass;
      const base = ac.base ?? 0;
      const dexBonus = ac.dex_bonus;
      const maxBonus = ac.max_bonus;

      if (base > 0) {
        if (dexBonus === false) {
          armorAc = base;
        } else if (maxBonus !== undefined) {
          armorAc = base + Math.min(dexMod, maxBonus);
        } else {
          armorAc = base + dexMod;
        }
      }
    }

    // Step 2: Determine base AC (armor, unarmored defense, or default)
    const classSlugs = charClasses.map((cc) => cc.class.slug.replace(/-phb$/, ''));
    const editionRules = character.source?.rules;
    let armorClass: number;

    if (armorAc !== null) {
      // Wearing armor — use armor AC
      armorClass = armorAc;
    } else {
      // Not wearing armor — check Unarmored Defense
      if (classSlugs.includes('barbarian')) {
        // Barbarian Unarmored Defense: 10 + DEX + CON (can use shield)
        armorClass = 10 + dexMod + conMod;
      } else if (classSlugs.includes('monk')) {
        // Monk Unarmored Defense: 10 + DEX + WIS
        const wisMod = mod('wis');
        armorClass = 10 + dexMod + wisMod;
        // 2014: Unarmored Defense doesn't work with shields (lose WIS, keep base)
        // 2024: Unarmored Defense works with shields
        if (hasShield && editionRules?.hasWeaponMastery === false) {
          // 2014 edition — shield breaks Unarmored Defense
          armorClass = 10 + dexMod;
        }
      } else {
        armorClass = 10 + dexMod;
      }
    }

    // Step 3: Add shield bonus (+2)
    if (hasShield) {
      armorClass += 2;
    }

    // Spec 012 Fase 0 — Fighting Style: Defense dá +1 AC se usando armadura
    // (qualquer armor; RAW só exige "armor", inclui light/medium/heavy).
    if (charOrigin.fighting_style_index === 'defense' && armorAc !== null) {
      armorClass += 1;
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

    // Skills (all SRD skills, sorted alphabetically)
    const allSkills = await this.skillRepo.find({
      relations: ['ability_score'],
      order: { name: 'ASC' },
    });
    const proficientSkillIds = new Set(charSkills.map((s) => s.skill_id));
    const expertiseSkillIds = new Set(
      charSkills.filter((s) => s.expertise).map((s) => s.skill_id),
    );

    const skills: SkillBlock[] = allSkills.map((skill) => {
      const abilitySlug = skill.ability_score?.slug ?? 'dex';
      const isProficient = proficientSkillIds.has(skill.id);
      const isExpertise = expertiseSkillIds.has(skill.id);
      const bonus =
        mod(abilitySlug) +
        (isProficient ? profBonus : 0) +
        (isExpertise ? profBonus : 0);
      return {
        slug: skill.slug,
        name: skill.name,
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
      const scAbility = getSpellcastingAbility(classSlug);
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
    const raceTraitChoices = charOrigin.race_trait_choices ?? [];
    const draconicChoice = raceTraitChoices.find((c) => DRACONIC_ANCESTRY_MAP[c]);
    const draconicAncestry = draconicChoice
      ? {
          dragon:
            draconicChoice.charAt(0).toUpperCase() + draconicChoice.slice(1),
          damageType: DRACONIC_ANCESTRY_MAP[draconicChoice].damageType,
        }
      : undefined;

    const originDetails: Record<string, unknown> = {
      raceTraitChoices,
      draconicAncestry,
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
      const proficient = isEquipmentProficient(
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
        mainHand: ce.mainHand,
        offHand: ce.offHand,
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

      kiPoints: (() => {
        const monkClass = charClasses.find((cc) => normalizeClassSlug(cc.class.slug) === 'monk');
        if (!monkClass || monkClass.class_level < 2) return undefined;
        return {
          total: monkClass.class_level,
          used: charState?.ki_points_used ?? 0,
        };
      })(),

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
      exhaustionLevel: charState?.exhaustion_level ?? 0,
      inspiration: charState?.inspiration ?? false,
      hasBlindsight10ft: charOrigin.fighting_style_index === 'blind-fighting',
      hasRemarkableAthlete: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('remarkable-athlete'),
      ),
      hasHeroicWarrior: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('heroic-warrior'),
      ),
      hasSurvivor: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('survivor'),
      ),
      hasDangerSense: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('danger-sense'),
      ),
      hasPrimalKnowledge: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('primal-knowledge'),
      ),
      hasFastMovement: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('fast-movement'),
      ),
      hasFeralInstinct: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('feral-instinct'),
      ),
      hasInstinctivePounce: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('instinctive-pounce'),
      ),
      hasBrutalStrike: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('brutal-strike') ||
        (cf.feature?.slug ?? '').startsWith('improved-brutal-strike'),
      ),
      hasRelentlessRage: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('relentless-rage'),
      ),
      hasPersistentRage: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('persistent-rage'),
      ),
      hasIndomitableMight: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('indomitable-might'),
      ),
      hasPrimalChampion: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('primal-champion'),
      ),
      hasFrenzy: charFeatures.some((cf) => (cf.feature?.slug ?? '') === 'frenzy' || (cf.feature?.slug ?? '').startsWith('frenzy-')),
      hasMindlessRage: charFeatures.some((cf) => (cf.feature?.slug ?? '') === 'mindless-rage' || (cf.feature?.slug ?? '').startsWith('mindless-rage-')),
      hasRetaliation: charFeatures.some((cf) => (cf.feature?.slug ?? '') === 'retaliation' || (cf.feature?.slug ?? '').startsWith('retaliation-')),
      hasIntimidatingPresence: charFeatures.some((cf) => (cf.feature?.slug ?? '') === 'intimidating-presence' || (cf.feature?.slug ?? '').startsWith('intimidating-presence-')),
      hasDivineOrder: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('divine-order')),
      hasChannelDivinity: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('channel-divinity')),
      hasTurnUndead: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('channel-divinity-turn-undead') ||
        (cf.feature?.slug ?? '') === 'turn-undead',
      ),
      hasSearUndead: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('sear-undead')),
      hasBlessedStrikes: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('blessed-strikes') ||
        (cf.feature?.slug ?? '').startsWith('improved-blessed-strikes'),
      ),
      hasImprovedBlessedStrikes: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('improved-blessed-strikes')),
      hasDivineIntervention: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('divine-intervention') ||
        (cf.feature?.slug ?? '').startsWith('greater-divine-intervention'),
      ),
      hasGreaterDivineIntervention: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('greater-divine-intervention')),
      hasDiscipleOfLife: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('disciple-of-life')),
      hasPreserveLife: charFeatures.some((cf) =>
        (cf.feature?.slug ?? '').startsWith('channel-divinity-preserve-life') ||
        (cf.feature?.slug ?? '') === 'preserve-life',
      ),
      hasBlessedHealer: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('blessed-healer')),
      hasSupremeHealing: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('supreme-healing')),
      hasWardingFlare: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('warding-flare')),
      hasRadianceOfTheDawn: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('radiance-of-the-dawn')),
      hasInvokeDuplicity: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('invoke-duplicity')),
      hasWarPriest: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('war-priest')),
      hasGuidedStrike: charFeatures.some((cf) => (cf.feature?.slug ?? '').startsWith('guided-strike')),

      equipment,
      magicItems,
      totalWeight: Math.round(totalWeight * 100) / 100,
      encumbered,
      attunementSlots: { used: attunedCount, max: 3 },

      originDetails,

      source: character.source
        ? { code: character.source.code, name: character.source.name }
        : undefined,

      createdAt: character.createdAt.toISOString(),
      updatedAt: character.updatedAt.toISOString(),
    };
  }

  private async getClassSavingThrows(
    charClasses: CharacterClassEntity[],
  ): Promise<Set<string>> {
    // D&D 5e: multiclass only grants saving throw proficiency from the FIRST class
    const primaryClass = charClasses[0];
    if (!primaryClass) return new Set();

    const savingThrows = await this.classSavingThrowRepo
      .createQueryBuilder('cst')
      .innerJoinAndSelect('cst.ability_score', 'as')
      .where('cst.class_id = :classId', { classId: primaryClass.class_id })
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
      const type = getCasterSlotType(cc.class.slug);
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
            kind: 'standard',
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
          kind: 'pact',
        });
      }
    }

    return result;
  }

}
