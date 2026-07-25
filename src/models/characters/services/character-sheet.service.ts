import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
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
  RaceTraitEntity,
  CampaignPartyMemberEntity,
  LevelEntity,
  ClassSavingThrowEntity,
  ClassProficiencyEntity,
  EquipmentCategoryItemEntity,
  SkillEntity,
} from "src/entities";
import { ProficiencyTypeEnum } from "src/entities/enums";
import {
  PROF_BONUS_BY_LEVEL,
  XP_THRESHOLDS,
  FULL_CASTER_SLOTS,
  WARLOCK_SLOTS,
  getSpellcastingAbility,
  getCasterSlotType,
  getStandardCasterLevelContribution,
  normalizeClassSlug,
} from "src/shared/srd-constants";
import {
  getAbilityModifier,
  isEquipmentProficient,
  DRACONIC_ANCESTRY_MAP,
} from "src/shared/srd-utils";
import type { EquipmentArmorClass } from "src/shared/equipment-types";
import { getSecondWindMaxUses } from "src/shared/fighter-rules";
import {
  getAlwaysPreparedPaladinSpells,
  normalizePreparedSpellSlug,
} from "src/shared/paladin-spell-rules";
import {
  findGiantAncestryChoice,
  GIANT_ANCESTRY_DESCRIPTIONS,
  GIANT_ANCESTRY_DISPLAY_NAMES,
} from "src/shared/goliath-rules";
import {
  isElementalFuryFeatureSlug,
  normalizeElementalFuryChoice,
  type ElementalFuryChoice,
} from "src/shared/druid-rules";
import { classifyFeatureForActions } from "./feature-classification";
import { ensureCharacterReadAccess } from "src/shared/character-guard";
import {
  renderFeatureDescription,
  extractNarrativeDescriptor,
} from "./feature-text-renderer";



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

  kind?: "standard" | "pact";
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
  sourceCode?: string;
  sourceClass?: string;
  active: boolean;
  category?: "active" | "passive" | "capstone" | "resource";
  displayText?: string;
  narrativeDescriptor?: string;
  tacticalValue?: number;
  choices?: Record<string, unknown>;
  resourceCharges?: {
    current?: number;
    max: number | null;
    formula?: string;
    recharge?: "short" | "long" | "turn" | "none";
  };
  isPassive: boolean;
}

const SPECIES_TRAIT_MIN_LEVEL: Record<string, number> = {
  "celestial-revelation": 3,
  "draconic-flight": 5,
  "large-form": 5,
};

const ACTIVE_SPECIES_TRAITS = new Set([
  "adrenaline-rush",
  "breath-weapon",
  "celestial-revelation",
  "giant-ancestry",
  "healing-hands",
  "large-form",
  "relentless-endurance",
]);

function canonicalSpeciesTraitSlug(slug: string): string {
  const canonical = slug
    .toLowerCase()
    .replace(/-(?:phb|xphb|srd52)$/i, "")
    .replace(/-5(?:[.-]?2)?$/i, "");
  return canonical === "lucky" ? "luck" : canonical;
}

function isSelectedDraconicAncestryTrait(
  slug: string,
  ancestryChoice?: string,
): boolean {
  const match = canonicalSpeciesTraitSlug(slug).match(
    /^draconic-ancestry-(black|blue|brass|bronze|copper|gold|green|red|silver|white)$/,
  );
  return !match || match[1] === ancestryChoice;
}

export interface EquipmentBlock {
  id: string;
  slug: string;
  name: string;
  weight: number;
  quantity: number;
  equipped: boolean;

  mainHand?: boolean;

  offHand?: boolean;
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


  classes: ClassBlock[];
  totalLevel: number;
  proficiencyBonus: number;


  abilityScores: AbilityScoreBlock[];


  maxHp: number;
  currentHp: number;
  tempHp: number;
  armorClass: number;
  initiative: number;
  speed: number;
  hitDice: Array<{ die: number; total: number; used: number }>;
  carryingCapacity: number;


  deathSaves: { successes: number; failures: number };


  skills: SkillBlock[];
  passivePerception: number;


  savingThrows: SavingThrowBlock[];


  proficiencies: ProficiencyBlock[];


  features: FeatureBlock[];


  spells: SpellBlock[];
  spellSlots: SpellSlotBlock[];


  kiPoints?: { total: number; used: number };


  xp: number;
  nextLevelXp: number | null;
  levelUpAvailable: boolean;
  gold: { cp: number; sp: number; gp: number; pp: number };
  conditions: string[];
  exhaustionLevel: number;
  inspiration: boolean;

  hasBlindsight10ft?: boolean;

  hasRemarkableAthlete?: boolean;

  hasHeroicWarrior?: boolean;

  hasSurvivor?: boolean;


  hasDangerSense?: boolean;

  hasPrimalKnowledge?: boolean;

  hasFastMovement?: boolean;

  hasFeralInstinct?: boolean;

  hasInstinctivePounce?: boolean;

  hasBrutalStrike?: boolean;

  hasRelentlessRage?: boolean;

  hasPersistentRage?: boolean;

  hasIndomitableMight?: boolean;

  hasPrimalChampion?: boolean;


  hasFrenzy?: boolean;

  hasMindlessRage?: boolean;

  hasRetaliation?: boolean;

  hasIntimidatingPresence?: boolean;


  hasDivineOrder?: boolean;

  hasChannelDivinity?: boolean;

  hasTurnUndead?: boolean;

  hasSearUndead?: boolean;

  hasBlessedStrikes?: boolean;

  hasImprovedBlessedStrikes?: boolean;

  hasDivineIntervention?: boolean;

  hasGreaterDivineIntervention?: boolean;


  hasDiscipleOfLife?: boolean;

  hasPreserveLife?: boolean;

  hasBlessedHealer?: boolean;

  hasSupremeHealing?: boolean;

  hasWardingFlare?: boolean;

  hasRadianceOfTheDawn?: boolean;

  hasInvokeDuplicity?: boolean;

  hasWarPriest?: boolean;

  hasGuidedStrike?: boolean;


  hasDivineSense?: boolean;

  hasDivineSmite?: boolean;

  hasPaladinsSmite?: boolean;

  hasFaithfulSteed?: boolean;

  hasAuraOfProtection?: boolean;

  hasAuraOfCourage?: boolean;

  hasRadiantStrikes?: boolean;

  hasRestoringTouch?: boolean;

  hasAuraExpansion?: boolean;


  hasSacredWeapon?: boolean;

  hasAuraOfDevotion?: boolean;

  hasSmiteOfProtection?: boolean;

  hasHolyNimbus?: boolean;


  hasArcaneRecovery?: boolean;

  hasRitualAdept?: boolean;

  hasScholar?: boolean;

  hasMemorizeSpell?: boolean;

  hasSpellMastery?: boolean;

  hasSignatureSpells?: boolean;

  hasEvocationSavant?: boolean;

  hasSculptSpells?: boolean;

  hasPotentCantrip?: boolean;

  hasEmpoweredEvocation?: boolean;

  hasOverchannel?: boolean;


  hasInnateSorcery?: boolean;

  hasFontOfMagic?: boolean;

  hasMetamagic?: boolean;

  hasSorcerousRestoration?: boolean;

  hasSorceryIncarnate?: boolean;

  hasArcaneApotheosis?: boolean;


  hasDraconicResilience?: boolean;

  hasDragonAncestor?: boolean;

  hasElementalAffinity?: boolean;

  hasDragonWings?: boolean;

  hasDraconicPresence?: boolean;

  hasDragonCompanion?: boolean;


  hasWildMagicSurge?: boolean;

  hasTidesOfChaos?: boolean;


  hasLandsStride?: boolean;

  hasNaturesSanctuary?: boolean;



  hasEmptyBody?: boolean;

  hasSuperiorDefense?: boolean;

  hasBodyAndMind?: boolean;

  hasPerfectSelf?: boolean;

  hasElusive?: boolean;

  hasStrokeOfLuck?: boolean;

  hasFeralSenses?: boolean;

  hasFoeSlayer?: boolean;

  hasEldritchMaster?: boolean;

  hasBeastSpells?: boolean;

  hasArchdruid?: boolean;

  hasSuperiorInspiration?: boolean;

  hasWordsOfCreation?: boolean;


  equipment: EquipmentBlock[];
  magicItems: MagicItemBlock[];
  totalWeight: number;
  encumbered: boolean;
  attunementSlots: { used: number; max: number };


  originDetails: Record<string, unknown>;


  source?: { code: string; name: string };

  createdAt: string;
  updatedAt: string;
}


function buildFeatureBlock(
  cf: CharacterFeatureEntity,
  featureUsesUsed: Record<string, number>,
): FeatureBlock {
  const feature = cf.feature;
  const slug = feature.slug;
  const classification = classifyFeatureForActions(slug);

  const overrideCategory = feature.category;
  const isPassive =
    overrideCategory === "passive" ||
    overrideCategory === "capstone" ||
    classification?.kind === "hide";

  const category: FeatureBlock["category"] =
    overrideCategory ??
    (classification?.kind === "hide" ? "passive" : undefined);

  const displayText =
    feature.display_text?.trim() ||
    renderFeatureDescription(feature.description) ||
    undefined;

  const narrativeDescriptor =
    feature.narrative_descriptor?.trim() ||
    (displayText ? extractNarrativeDescriptor(displayText, 120) : undefined) ||
    undefined;

  let resourceCharges: FeatureBlock["resourceCharges"] | undefined;
  if (feature.resource_charges || feature.recharge_rule) {
    const rawCharges = feature.resource_charges ?? { max: null };
    const resourceKey =
      classification?.kind === "alias" && classification.canonicalSlug
        ? classification.canonicalSlug
        : slug;
    const used = featureUsesUsed[resourceKey] ?? 0;
    const max = rawCharges.max ?? null;
    resourceCharges = {
      max,
      current: max != null ? Math.max(0, max - used) : undefined,
      formula: rawCharges.formula,
      recharge: feature.recharge_rule,
    };
  }

  return {
    slug,
    name: feature.name,
    level: feature.level,
    description: feature.description,
    sourceCode: feature.source?.code,
    sourceClass: cf.source_class?.name,
    active: cf.active,
    category,
    displayText,
    narrativeDescriptor,
    tacticalValue: feature.tactical_value,
    choices: cf.choices ?? {},
    resourceCharges,
    isPassive,
  };
}

@Injectable()
export class CharacterSheetService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CampaignPartyMemberEntity)
    private readonly partyMemberRepo: Repository<CampaignPartyMemberEntity>,
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
    @InjectRepository(RaceTraitEntity)
    private readonly raceTraitRepo: Repository<RaceTraitEntity>,
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

  private resolveElementalFuryChoice(
    characterFeatures: CharacterFeatureEntity[],
  ): ElementalFuryChoice {
    const parent = characterFeatures.find((characterFeature) =>
      (characterFeature.feature?.slug ?? "").startsWith("elemental-fury-"),
    );
    const explicit = normalizeElementalFuryChoice(parent?.choices);
    if (explicit) return explicit;

    const hasPrimalStrike = characterFeatures.some((characterFeature) =>
      (characterFeature.feature?.slug ?? "").startsWith("primal-strike-"),
    );
    const hasPotentSpellcasting = characterFeatures.some((characterFeature) =>
      (characterFeature.feature?.slug ?? "").startsWith(
        "potent-spellcasting-",
      ),
    );
    if (hasPotentSpellcasting && !hasPrimalStrike) {
      return "potent-spellcasting";
    }

    // Registros anteriores à coleta explícita da escolha continham as duas
    // opções. Mantemos uma escolha determinística e válida em vez de conceder
    // ambas; novas progressões exigem seleção no level-up.
    return "primal-strike";
  }

  async computeSheet(
    userId: string,
    characterId: string,
  ): Promise<CharacterSheet> {
    const character = await ensureCharacterReadAccess(
      this.characterRepo,
      userId,
      characterId,
      this.partyMemberRepo,
    );


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
        order: { order: "ASC" },
      }),
      this.charAbilityRepo.find({ where: { character_id: characterId } }),
      this.charSkillRepo.find({
        where: { character_id: characterId },
        relations: ["skill", "skill.ability_score"],
      }),
      this.charProfRepo.find({ where: { character_id: characterId } }),
      this.charSpellRepo.find({ where: { character_id: characterId } }),
      this.charEquipRepo.find({ where: { character_id: characterId } }),
      this.charMagicItemRepo.find({ where: { character_id: characterId } }),
      this.charStateRepo.findOne({ where: { character_id: characterId } }),
      this.charLevelUpRepo.find({
        where: { character_id: characterId },
        order: { total_level: "ASC" },
      }),
      this.charFeatureRepo.find({
        where: { character_id: characterId },
        relations: ["source_class", "feature.source"],
      }),
      this.charOriginRepo.findOne({ where: { character_id: characterId } }),
    ]);

    if (!charOrigin) {
      throw new NotFoundException(
        "Dados de origem do personagem nao encontrados.",
      );
    }

    const raceTraits = await this.raceTraitRepo.find({
      where: { race_id: charOrigin.race_id },
      relations: ["trait", "trait.source"],
    });


    const totalLevel = charClasses.reduce((sum, cc) => sum + cc.class_level, 0);
    const profBonus = PROF_BONUS_BY_LEVEL[Math.min(totalLevel, 20)] ?? 2;


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
      "str",
      "dex",
      "con",
      "int",
      "wis",
      "cha",
    ].map((slug) => {
      const entry = abilityMap.get(slug);
      return {
        slug,
        name: entry?.name ?? slug.toUpperCase(),
        score: entry?.score ?? 10,
        modifier: mod(slug),
      };
    });


    const primaryClass = charClasses[0];
    const conMod = mod("con");
    let maxHp = primaryClass
      ? primaryClass.class.hit_die + conMod
      : 10 + conMod;
    for (const lu of charLevelUps) {
      maxHp += lu.hp_gained;
    }
    maxHp += charState?.max_hp_bonus ?? 0;


    const subraceSpeed = (
      charOrigin.subrace?.raw as { speed?: unknown } | null | undefined
    )?.speed;
    let speed =
      typeof subraceSpeed === "number"
        ? subraceSpeed
        : (charOrigin.race?.speed ?? 30);
    const hasFastMovementFeat = charFeatures.some((cf) =>
      (cf.feature?.slug ?? "").startsWith("fast-movement"),
    );
    if (hasFastMovementFeat) {

      const heavyArmorSlugs = new Set([
        "chain-mail",
        "splint",
        "plate",
        "ring-mail",
      ]);
      const heavyArmorEquipped = charEquip.some(
        (eq) =>
          eq.equipped &&
          heavyArmorSlugs.has((eq.equipment?.slug ?? "").toLowerCase()),
      );
      if (!heavyArmorEquipped) speed += 10;
    }
    const monkLevel =
      charClasses.find(
        (cc) => normalizeClassSlug(cc.class.slug) === "monk",
      )?.class_level ?? 0;
    const monkIsUnarmored = !charEquip.some(
      (eq) => eq.equipped && Boolean(eq.equipment?.armor_class),
    );
    if (monkLevel >= 2 && monkIsUnarmored) {
      speed +=
        monkLevel >= 18
          ? 30
          : monkLevel >= 14
            ? 25
            : monkLevel >= 10
              ? 20
              : monkLevel >= 6
                ? 15
                : 10;
    }


    const dexMod = mod("dex");




    let armorAc: number | null = null;
    let hasShield = false;
    for (const eq of charEquip) {
      if (!eq.equipped || !eq.equipment?.armor_class) continue;
      const slug = (eq.equipment.slug ?? "").toLowerCase();
      const name = (eq.equipment.name ?? "").toLowerCase();
      const isShield = slug === "shield" || name === "shield";
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


    const classSlugs = charClasses.map((cc) =>
      cc.class.slug.replace(/-phb$/, ""),
    );
    const editionRules = character.source?.rules;
    let armorClass: number;

    if (armorAc !== null) {

      armorClass = armorAc;
    } else {

      if (classSlugs.includes("barbarian")) {

        armorClass = 10 + dexMod + conMod;
      } else if (classSlugs.includes("monk")) {

        const wisMod = mod("wis");
        armorClass = 10 + dexMod + wisMod;


        if (hasShield && editionRules?.hasWeaponMastery === false) {

          armorClass = 10 + dexMod;
        }
      } else {
        armorClass = 10 + dexMod;
      }
    }


    if (hasShield) {
      armorClass += 2;
    }



    if (charOrigin.fighting_style_index === "defense" && armorAc !== null) {
      armorClass += 1;
    }


    const initiative = dexMod;


    const classSavingThrows = await this.getClassSavingThrows(charClasses);
    const savingThrows: SavingThrowBlock[] = [
      "str",
      "dex",
      "con",
      "int",
      "wis",
      "cha",
    ].map((slug) => {
      const proficient = classSavingThrows.has(slug);
      return {
        slug,
        name: abilityMap.get(slug)?.name ?? slug.toUpperCase(),
        proficient,
        bonus: mod(slug) + (proficient ? profBonus : 0),
      };
    });



    const allSkillRows = await this.skillRepo.find({
      relations: ["ability_score", "source"],
      order: { name: "ASC" },
    });
    const isXphbSource = (s: (typeof allSkillRows)[number]) =>
      s.source?.code === "XPHB" || s.source?.code === "SRD52";
    const skillsByName = new Map<string, (typeof allSkillRows)[number]>();
    for (const s of allSkillRows) {
      const existing = skillsByName.get(s.name);
      const better =
        !existing ||
        (!existing.ability_score && s.ability_score) ||
        (!isXphbSource(existing) && isXphbSource(s));
      if (better) skillsByName.set(s.name, s);
    }
    const uniqueSkills = [...skillsByName.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );



    const skillNameById = new Map(allSkillRows.map((s) => [s.id, s.name]));
    const proficientSkillNames = new Set(
      charSkills
        .map((s) => skillNameById.get(s.skill_id))
        .filter((n): n is string => !!n),
    );
    const expertiseSkillNames = new Set(
      charSkills
        .filter((s) => s.expertise)
        .map((s) => skillNameById.get(s.skill_id))
        .filter((n): n is string => !!n),
    );

    const skills: SkillBlock[] = uniqueSkills.map((skill) => {
      const abilitySlug = skill.ability_score?.slug ?? "dex";
      const isProficient = proficientSkillNames.has(skill.name);
      const isExpertise = expertiseSkillNames.has(skill.name);
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


    const perceptionSkill = skills.find(
      (skill) => skill.name.toLowerCase() === "perception",
    );
    const perceptionCharacterSkill = charSkills.find(
      (skill) =>
        skill.skill.name?.toLowerCase() === "perception" ||
        skill.skill.slug.replace(/-phb$/, "") === "perception",
    );
    const fallbackPerceptionBonus =
      mod("wis") +
      (perceptionCharacterSkill ? profBonus : 0) +
      (perceptionCharacterSkill?.expertise ? profBonus : 0);
    const passivePerception =
      10 + (perceptionSkill?.bonus ?? fallbackPerceptionBonus);


    const hitDice = charClasses.map((cc) => ({
      die: cc.class.hit_die,
      total: cc.class_level,
      used:
        (charState?.hit_dice_used as Record<string, number>)?.[cc.class.slug] ??
        0,
    }));


    const strScore = abilityMap.get("str")?.score ?? 10;
    const carryingCapacity = strScore * 15;

    const totalWeight = charEquip.reduce((sum, ce) => {
      const w = parseFloat(ce.equipment.weight) || 0;
      return sum + w * ce.quantity;
    }, 0);
    const encumbered = totalWeight > carryingCapacity;


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


    const spells: SpellBlock[] = charSpells.map((cs) => ({
      slug: cs.spell.slug,
      name: cs.spell.name,
      level: cs.spell.level,
      source: cs.source,
      status: cs.status,
      alwaysPrepared: cs.always_prepared,
    }));
    const existingSpellSlugs = new Set(
      spells.map((spell) => normalizePreparedSpellSlug(spell.slug)),
    );
    for (const spell of getAlwaysPreparedPaladinSpells(
      charClasses,
      character.source?.code !== "PHB",
    )) {
      if (existingSpellSlugs.has(spell.slug)) continue;
      spells.push({
        slug: spell.slug,
        name: spell.name,
        level: spell.level,
        source: spell.grantedBy,
        status: "prepared",
        alwaysPrepared: true,
      });
      existingSpellSlugs.add(spell.slug);
    }
    const hasFaithfulSteedFeature = charFeatures.some(
      (characterFeature) =>
        characterFeature.active !== false &&
        /^faithful-steed-paladin-\d+$/.test(
          characterFeature.feature?.slug ?? "",
        ),
    );
    if (
      hasFaithfulSteedFeature &&
      !spells.some(
        (spell) =>
          spell.slug.toLowerCase().replace(/-(phb|xphb|srd52)$/, "") ===
          "find-steed",
      )
    ) {
      spells.push({
        slug: "find-steed",
        name: "Find Steed",
        level: 2,
        source: "feature",
        status: "prepared",
        alwaysPrepared: true,
      });
    }


    const spellSlots = this.computeSpellSlots(charClasses, charState);


    const proficiencies: ProficiencyBlock[] = charProfs.map((cp) => ({
      slug: cp.proficiency.slug,
      name: cp.proficiency.name,
      type: cp.proficiency.proficiency_type,
      source: cp.source,
    }));


    const existingProfSlugs = new Set(proficiencies.map((p) => p.slug));
    const classIds = charClasses.map((cc) => cc.class_id);
    if (classIds.length > 0) {
      const classProfs = await this.classProfRepo
        .createQueryBuilder("cp")
        .innerJoinAndSelect("cp.proficiency", "p")
        .where("cp.class_id IN (:...classIds)", { classIds })
        .getMany();
      for (const cp of classProfs) {
        if (!existingProfSlugs.has(cp.proficiency.slug)) {
          existingProfSlugs.add(cp.proficiency.slug);
          proficiencies.push({
            slug: cp.proficiency.slug,
            name: cp.proficiency.name,
            type: cp.proficiency.proficiency_type,
            source: "class",
          });
        }
      }
    }


    const featureUsesUsed =
      (charState as unknown as { feature_uses_used?: Record<string, number> })
        ?.feature_uses_used ?? {};

    const elementalFuryChoice = this.resolveElementalFuryChoice(charFeatures);
    const selectedCharFeatures = charFeatures.filter((cf) => {
      const slug = cf.feature?.slug ?? "";
      if (
        !slug.startsWith("primal-strike-") &&
        !slug.startsWith("potent-spellcasting-")
      ) {
        return true;
      }
      return isElementalFuryFeatureSlug(slug, elementalFuryChoice);
    });
    const features: FeatureBlock[] = selectedCharFeatures.map((cf) =>
      buildFeatureBlock(cf, featureUsesUsed),
    );
    const fighterLevel =
      charClasses.find(
        (cc) => normalizeClassSlug(cc.class.slug) === "fighter",
      )?.class_level ?? 0;
    if (fighterLevel > 0) {
      const maxSecondWindUses = getSecondWindMaxUses(
        fighterLevel,
        character.source?.code !== "PHB",
      );
      const usedSecondWind = featureUsesUsed["second-wind"] ?? 0;
      for (const feature of features) {
        const featureClassification = classifyFeatureForActions(feature.slug);
        const canonicalFeatureSlug =
          featureClassification?.kind === "alias"
            ? featureClassification.canonicalSlug
            : feature.slug;
        if (canonicalFeatureSlug !== "second-wind") {
          continue;
        }
        feature.category = "resource";
        feature.resourceCharges = {
          current: Math.max(0, maxSecondWindUses - usedSecondWind),
          max: maxSecondWindUses,
          formula: "2 usos; +1 nos níveis 4 e 10",
          recharge: "short",
        };
      }
    }
    const druidLevel =
      charClasses.find(
        (cc) => normalizeClassSlug(cc.class.slug) === "druid",
      )?.class_level ?? 0;
    if (druidLevel >= 10) {
      const moonlightStepMax = Math.max(1, mod("wis"));
      const moonlightStepUsed = featureUsesUsed["moonlight-step"] ?? 0;
      for (const feature of features) {
        const featureClassification = classifyFeatureForActions(feature.slug);
        const canonicalFeatureSlug =
          featureClassification?.kind === "alias"
            ? featureClassification.canonicalSlug
            : feature.slug;
        if (canonicalFeatureSlug !== "moonlight-step") continue;
        feature.name = "Passo ao Luar";
        feature.displayText =
          "Como Ação Bônus, teleporte-se magicamente até 30 pés para um espaço desocupado que você possa ver. Você tem Vantagem no próximo ataque que fizer antes do fim deste turno. Você pode recuperar um uso gastando um slot de magia de nível 2 ou maior, sem ação.";
        feature.narrativeDescriptor =
          "Teleporte de 30 pés; concede Vantagem no próximo ataque do turno.";
        feature.category = "resource";
        feature.resourceCharges = {
          current: Math.max(0, moonlightStepMax - moonlightStepUsed),
          max: moonlightStepMax,
          formula: "Modificador de Sabedoria (mínimo 1)",
          recharge: "long",
        };
      }
    }


    const raceTraitChoices = charOrigin.race_trait_choices ?? [];
    const draconicChoice = raceTraitChoices.find(
      (c) => DRACONIC_ANCESTRY_MAP[c],
    );
    const draconicAncestry = draconicChoice
      ? {
          dragon:
            draconicChoice.charAt(0).toUpperCase() + draconicChoice.slice(1),
          damageType: DRACONIC_ANCESTRY_MAP[draconicChoice].damageType,
        }
      : undefined;

    const seenSpeciesTraits = new Set<string>();
    const preferredRaceTraits = [...raceTraits].sort((a, b) => {
      const aPreferred = a.trait?.source?.code === "XPHB" ? 0 : 1;
      const bPreferred = b.trait?.source?.code === "XPHB" ? 0 : 1;
      return aPreferred - bPreferred;
    });
    for (const raceTrait of preferredRaceTraits) {
      const trait = raceTrait.trait;
      if (!trait) continue;
      const slug = canonicalSpeciesTraitSlug(trait.slug);
      if (
        !isSelectedDraconicAncestryTrait(
          trait.slug,
          draconicChoice,
        )
      ) {
        continue;
      }
      if (seenSpeciesTraits.has(slug)) continue;
      seenSpeciesTraits.add(slug);

      const requiredLevel = SPECIES_TRAIT_MIN_LEVEL[slug] ?? 1;
      const isPassive = !ACTIVE_SPECIES_TRAITS.has(slug);
      const displayText = (trait.description ?? []).join("\n\n");
      const featureBlock: FeatureBlock = {
        slug,
        name: trait.name,
        level: requiredLevel,
        description: { text: trait.description ?? [] },
        sourceCode: trait.source?.code,
        sourceClass: charOrigin.race.name,
        active: totalLevel >= requiredLevel,
        category: isPassive ? "passive" : "active",
        displayText,
        narrativeDescriptor: displayText
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180),
        isPassive,
      };

      if (slug === "giant-ancestry") {
        const selectedAncestry = findGiantAncestryChoice(raceTraitChoices);
        const max = profBonus;
        featureBlock.name = selectedAncestry
          ? `Ancestralidade Gigante — ${GIANT_ANCESTRY_DISPLAY_NAMES[selectedAncestry]}`
          : "Ancestralidade Gigante";
        featureBlock.displayText = selectedAncestry
          ? `${GIANT_ANCESTRY_DISPLAY_NAMES[selectedAncestry]}\n\n${GIANT_ANCESTRY_DESCRIPTIONS[selectedAncestry]}\n\nVocê pode usar este benefício ${max} vezes e recupera todos os usos ao terminar um Descanso Longo.`
          : "Escolha um legado gigante para habilitar este traço.";
        featureBlock.narrativeDescriptor = selectedAncestry
          ? `Escolha atual: ${GIANT_ANCESTRY_DISPLAY_NAMES[selectedAncestry]}`
          : "Nenhuma ancestralidade escolhida";
        featureBlock.category = "resource";
        featureBlock.resourceCharges = {
          current: Math.max(
            0,
            max - (featureUsesUsed["giant-ancestry"] ?? 0),
          ),
          max,
          formula: "Bônus de Proficiência",
          recharge: "long",
        };
      }

      if (slug === "breath-weapon") {
        const max = profBonus;
        featureBlock.category = "resource";
        featureBlock.resourceCharges = {
          current: Math.max(
            0,
            max - (featureUsesUsed["breath-weapon"] ?? 0),
          ),
          max,
          formula: "Bônus de Proficiência",
          recharge: "long",
        };
      }
      features.push(featureBlock);
    }

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


    const equipIds = charEquip.map((ce) => ce.equipment_id);
    const equipCatMap = new Map<string, Set<string>>();
    if (equipIds.length > 0) {
      const catItems = await this.equipCatItemRepo.find({
        where: equipIds.map((eid) => ({ equipment_id: eid })),
        relations: ["category"],
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
        const monkClass = charClasses.find(
          (cc) => normalizeClassSlug(cc.class.slug) === "monk",
        );
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
      hasBlindsight10ft: charOrigin.fighting_style_index === "blind-fighting",
      hasRemarkableAthlete: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("remarkable-athlete"),
      ),
      hasHeroicWarrior: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("heroic-warrior"),
      ),
      hasSurvivor: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("survivor"),
      ),
      hasDangerSense: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("danger-sense"),
      ),
      hasPrimalKnowledge: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("primal-knowledge"),
      ),
      hasFastMovement: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("fast-movement"),
      ),
      hasFeralInstinct: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("feral-instinct"),
      ),
      hasInstinctivePounce: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("instinctive-pounce"),
      ),
      hasBrutalStrike: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "").startsWith("brutal-strike") ||
          (cf.feature?.slug ?? "").startsWith("improved-brutal-strike"),
      ),
      hasRelentlessRage: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("relentless-rage"),
      ),
      hasPersistentRage: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("persistent-rage"),
      ),
      hasIndomitableMight: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("indomitable-might"),
      ),
      hasPrimalChampion: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("primal-champion"),
      ),
      hasFrenzy: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "") === "frenzy" ||
          (cf.feature?.slug ?? "").startsWith("frenzy-"),
      ),
      hasMindlessRage: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "") === "mindless-rage" ||
          (cf.feature?.slug ?? "").startsWith("mindless-rage-"),
      ),
      hasRetaliation: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "") === "retaliation" ||
          (cf.feature?.slug ?? "").startsWith("retaliation-"),
      ),
      hasIntimidatingPresence: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "") === "intimidating-presence" ||
          (cf.feature?.slug ?? "").startsWith("intimidating-presence-"),
      ),
      hasDivineOrder: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("divine-order"),
      ),
      hasChannelDivinity: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("channel-divinity"),
      ),
      hasTurnUndead: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "").startsWith("channel-divinity-turn-undead") ||
          (cf.feature?.slug ?? "").startsWith("turn-undead"),
      ),
      hasSearUndead: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("sear-undead"),
      ),
      hasBlessedStrikes: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "").startsWith("blessed-strikes") ||
          (cf.feature?.slug ?? "").startsWith("improved-blessed-strikes"),
      ),
      hasImprovedBlessedStrikes: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("improved-blessed-strikes"),
      ),
      hasDivineIntervention: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "").startsWith("divine-intervention") ||
          (cf.feature?.slug ?? "").startsWith("greater-divine-intervention"),
      ),
      hasGreaterDivineIntervention: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("greater-divine-intervention"),
      ),
      hasDiscipleOfLife: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("disciple-of-life"),
      ),
      hasPreserveLife: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "").startsWith(
            "channel-divinity-preserve-life",
          ) || (cf.feature?.slug ?? "") === "preserve-life",
      ),
      hasBlessedHealer: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("blessed-healer"),
      ),
      hasSupremeHealing: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("supreme-healing"),
      ),
      hasWardingFlare: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("warding-flare"),
      ),
      hasRadianceOfTheDawn: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("radiance-of-the-dawn"),
      ),
      hasInvokeDuplicity: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("invoke-duplicity"),
      ),
      hasWarPriest: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("war-priest"),
      ),
      hasGuidedStrike: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("guided-strike"),
      ),

      hasDivineSense: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("divine-sense"),
      ),
      hasDivineSmite: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "") === "divine-smite" ||
          (cf.feature?.slug ?? "").startsWith("divine-smite-"),
      ),
      hasPaladinsSmite: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("paladins-smite"),
      ),
      hasFaithfulSteed: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("faithful-steed"),
      ),
      hasAuraOfProtection: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("aura-of-protection"),
      ),
      hasAuraOfCourage: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("aura-of-courage"),
      ),
      hasRadiantStrikes: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("radiant-strikes"),
      ),
      hasRestoringTouch: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("restoring-touch"),
      ),
      hasAuraExpansion: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("aura-expansion"),
      ),
      hasSacredWeapon: charFeatures.some((cf) => {
        const slug = cf.feature?.slug ?? "";
        return (
          slug.startsWith("channel-divinity-sacred-weapon") ||
          slug.startsWith("sacred-weapon")
        );
      }),
      hasAuraOfDevotion: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("aura-of-devotion"),
      ),
      hasSmiteOfProtection:
        charFeatures.some((cf) =>
          (cf.feature?.slug ?? "").startsWith("smite-of-protection"),
        ) ||
        classes.some(
          (classBlock) =>
            classBlock.slug.replace(/-(phb|xphb|srd52)$/i, "") === "paladin" &&
            classBlock.level >= 15 &&
            classBlock.subclass?.slug.toLowerCase().includes("devotion") ===
              true,
        ),
      hasHolyNimbus: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("holy-nimbus"),
      ),

      hasArcaneRecovery: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("arcane-recovery"),
      ),
      hasRitualAdept: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("ritual-adept"),
      ),
      hasScholar: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "").startsWith("scholar-wizard") ||
          (cf.feature?.slug ?? "") === "scholar",
      ),
      hasMemorizeSpell: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("memorize-spell"),
      ),
      hasSpellMastery: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("spell-mastery"),
      ),
      hasSignatureSpells: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "").startsWith("signature-spell") ||
          (cf.feature?.slug ?? "").startsWith("signature-spells"),
      ),
      hasEvocationSavant: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("evocation-savant"),
      ),
      hasSculptSpells: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("sculpt-spells"),
      ),
      hasPotentCantrip: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("potent-cantrip"),
      ),
      hasEmpoweredEvocation: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("empowered-evocation"),
      ),
      hasOverchannel: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("overchannel"),
      ),

      hasInnateSorcery: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("innate-sorcery"),
      ),
      hasFontOfMagic: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("font-of-magic"),
      ),
      hasMetamagic: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "").startsWith("metamagic-sorcerer") ||
          (cf.feature?.slug ?? "") === "metamagic-1" ||
          (cf.feature?.slug ?? "") === "metamagic-2" ||
          (cf.feature?.slug ?? "").startsWith("metamagic-options"),
      ),
      hasSorcerousRestoration: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("sorcerous-restoration"),
      ),
      hasSorceryIncarnate: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("sorcery-incarnate"),
      ),
      hasArcaneApotheosis: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("arcane-apotheosis"),
      ),
      hasDraconicResilience: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("draconic-resilience"),
      ),
      hasDragonAncestor: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("dragon-ancestor"),
      ),
      hasElementalAffinity: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("elemental-affinity"),
      ),
      hasDragonWings: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("dragon-wings"),
      ),
      hasDraconicPresence: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("draconic-presence"),
      ),
      hasDragonCompanion: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("dragon-companion"),
      ),
      hasWildMagicSurge: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("wild-magic-surge"),
      ),
      hasTidesOfChaos: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("tides-of-chaos"),
      ),
      hasLandsStride: charFeatures.some((cf) => {
        const slug = cf.feature?.slug ?? "";

        return slug.includes("lands-stride") || slug.includes("land-s-stride");
      }),
      hasNaturesSanctuary: charFeatures.some(
        (cf) =>
          (cf.feature?.slug ?? "").startsWith("natures-sanctuary") ||
          (cf.feature?.slug ?? "").startsWith("nature-s-sanctuary"),
      ),


      hasEmptyBody: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("empty-body"),
      ),
      hasSuperiorDefense: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("superior-defense"),
      ),
      hasBodyAndMind: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("body-and-mind"),
      ),
      hasPerfectSelf: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("perfect-self"),
      ),
      hasElusive: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("elusive"),
      ),
      hasStrokeOfLuck: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("stroke-of-luck"),
      ),
      hasFeralSenses: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("feral-senses"),
      ),
      hasFoeSlayer: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("foe-slayer"),
      ),
      hasEldritchMaster: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("eldritch-master"),
      ),
      hasBeastSpells: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("beast-spells"),
      ),
      hasArchdruid: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("archdruid"),
      ),
      hasSuperiorInspiration: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("superior-inspiration"),
      ),
      hasWordsOfCreation: charFeatures.some((cf) =>
        (cf.feature?.slug ?? "").startsWith("words-of-creation"),
      ),

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

    const primaryClass = charClasses[0];
    if (!primaryClass) return new Set();

    const savingThrows = await this.classSavingThrowRepo
      .createQueryBuilder("cst")
      .innerJoinAndSelect("cst.ability_score", "as")
      .where("cst.class_id = :classId", { classId: primaryClass.class_id })
      .getMany();

    const persisted = new Set(
      savingThrows.map((st) => st.ability_score.slug),
    );
    if (persisted.size > 0) return persisted;

    const canonicalSlug = primaryClass.class.slug.replace(/-phb$/, "");
    const fallback: Record<string, readonly string[]> = {
      barbarian: ["str", "con"],
      bard: ["dex", "cha"],
      cleric: ["wis", "cha"],
      druid: ["int", "wis"],
      fighter: ["str", "con"],
      monk: ["str", "dex"],
      paladin: ["wis", "cha"],
      ranger: ["str", "dex"],
      rogue: ["dex", "int"],
      sorcerer: ["con", "cha"],
      warlock: ["wis", "cha"],
      wizard: ["int", "wis"],
    };
    return new Set(fallback[canonicalSlug] ?? []);
  }

  private computeSpellSlots(
    charClasses: CharacterClassEntity[],
    charState: CharacterStateEntity | null,
  ): SpellSlotBlock[] {
    let standardCasterLevel = 0;
    let warlockLevel = 0;
    const isMulticlass = charClasses.length > 1;

    for (const cc of charClasses) {
      const type = getCasterSlotType(cc.class.slug);
      if (!type) continue;
      if (type === "full" || type === "half") {
        standardCasterLevel += getStandardCasterLevelContribution(
          cc.class.slug,
          cc.class_level,
          isMulticlass,
        );
      } else if (type === "pact") {
        warlockLevel = cc.class_level;
      }
    }

    const slotsUsed = charState?.spell_slots_used ?? {};

    const result: SpellSlotBlock[] = [];


    const effectiveCasterLevel = standardCasterLevel;

    if (effectiveCasterLevel > 0) {
      const slotTable = FULL_CASTER_SLOTS[Math.min(effectiveCasterLevel, 20)];
      if (slotTable) {
        for (let i = 0; i < slotTable.length; i++) {
          result.push({
            level: i + 1,
            total: slotTable[i],
            used: slotsUsed[String(i + 1)] ?? 0,
            kind: "standard",
          });
        }
      }
    }


    if (warlockLevel > 0) {
      const pact = WARLOCK_SLOTS[warlockLevel - 1];
      if (pact) {
        result.push({
          level: pact.level,
          total: pact.slots,
          used: slotsUsed["pact"] ?? 0,
          kind: "pact",
        });
      }
    }

    return result;
  }
}
