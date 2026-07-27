import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  CharacterEntity,
  CharacterClassEntity,
  CharacterAbilityScoreEntity,
  CharacterProficiencyEntity,
  CharacterSpellEntity,
  CharacterEquipmentEntity,
  CharacterFeatureEntity,
  CharacterStateEntity,
  CampaignPartyMemberEntity,
  EquipmentCategoryItemEntity,
  ClassProficiencyEntity,
  SpellEntity,
} from "src/entities";
import {
  ProficiencyTypeEnum,
  SpellSourceEnum,
  SpellStatusEnum,
} from "src/entities/enums";
import {
  PROF_BONUS_BY_LEVEL,
  getSpellcastingAbility,
  normalizeClassSlug,
} from "src/shared/srd-constants";
import {
  getAbilityModifier,
  isEquipmentProficient,
  DRACONIC_ANCESTRY_MAP,
} from "src/shared/srd-utils";
import { classifyFeatureForActions } from "./feature-classification";
import { ensureCharacterReadAccess } from "src/shared/character-guard";
import {
  getSpellAutomationEntry,
  type SpellAutomationBehaviorKind,
  type SpellAutomationStatus,
} from "src/models/game-engine/services/spell-automation-catalog";
import { getTileEffectDefinition } from "src/models/game-engine/services/tile-effect-catalog";
import { getAoeShape } from "src/models/game-engine/services/spell-targeting";
import { getWildShapeUses } from "src/shared/druid-rules";
import { getSecondWindMaxUses } from "src/shared/fighter-rules";
import { findGiantAncestryChoice } from "src/shared/goliath-rules";
import {
  getAlwaysPreparedPaladinSpells,
  normalizePreparedSpellSlug,
} from "src/shared/paladin-spell-rules";
import { hasPhbFeralSenses } from "src/models/game-engine/services/ranger-phb-rules";



export type ActionTiming =
  | "action"
  | "bonus_action"
  | "reaction"
  | "free"
  | "movement";
export type ActionSource =
  | "weapon"
  | "spell"
  | "feature"
  | "base"
  | "consumable";

export interface DamageBlock {
  dice: string;
  type: string;
  bonus?: number;
}

export interface ActionBlock {
  id: string;
  name: string;
  timing: ActionTiming;
  source: ActionSource;
  sourceLabel: string;
  description: string;
  attackBonus?: number;
  ignoresInvisibleTargetDisadvantage?: boolean;
  damage?: DamageBlock;
  versatileDamage?: DamageBlock;
  saveDc?: number;
  saveAbility?: string;

  saveSuccess?: "half" | "none" | "negates";

  featureSlug?: string;
  range?: string;
  properties?: string[];

  weaponSlug?: string;
  weaponActionSlug?: string;
  weaponCategory?: "melee" | "ranged";
  itemSlug?: string;

  masterySlug?: string;

  proficient?: boolean;

  handSlot?: "main" | "off" | null;
  uses?: number;
  usesMax?: number;
  usesRecharge?: string;
  wildResurgenceSlotRecoveryUsed?: boolean;
  faithfulSteedFreeCastUsed?: boolean;
  spellLevel?: number;
  requiresConcentration?: boolean;
  isRitual?: boolean;
  castingTime?: string;
  automationStatus?: SpellAutomationStatus;
  behaviorKind?: SpellAutomationBehaviorKind;
  automationTags?: string[];

  aoe?: {
    originType: "self" | "point" | "fixed";
    shape: "sphere" | "cone" | "line" | "cube" | "cylinder";
    sizeFt: number;
    rangeFt: number;
    maxPlacements?: number;
  };
}

export interface ActionsResponse {
  actions: ActionBlock[];
  bonusActions: ActionBlock[];
  reactions: ActionBlock[];
  freeActions: ActionBlock[];
  movement: { speed: number };
  summary: {
    attackCount: number;
    hasExtraAttack: boolean;
    spellSaveDc: Record<string, number>;
    spellAttackBonus: Record<string, number>;
  };
}

export function parseActionRangeFeet(range: string | null | undefined): number {
  const normalized = String(range ?? "").trim().toLowerCase();
  if (!normalized || normalized.includes("self")) return 0;
  const numeric = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!numeric) return 0;
  const value = Number(numeric[1]);
  return normalized.includes("mile") ? Math.round(value * 5280) : Math.round(value);
}

@Injectable()
export class ActionsService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CampaignPartyMemberEntity)
    private readonly partyMemberRepo: Repository<CampaignPartyMemberEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly charClassRepo: Repository<CharacterClassEntity>,
    @InjectRepository(CharacterAbilityScoreEntity)
    private readonly charAbilityRepo: Repository<CharacterAbilityScoreEntity>,
    @InjectRepository(CharacterProficiencyEntity)
    private readonly charProfRepo: Repository<CharacterProficiencyEntity>,
    @InjectRepository(CharacterSpellEntity)
    private readonly charSpellRepo: Repository<CharacterSpellEntity>,
    @InjectRepository(CharacterEquipmentEntity)
    private readonly charEquipRepo: Repository<CharacterEquipmentEntity>,
    @InjectRepository(CharacterFeatureEntity)
    private readonly charFeatureRepo: Repository<CharacterFeatureEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly charStateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(EquipmentCategoryItemEntity)
    private readonly equipCatItemRepo: Repository<EquipmentCategoryItemEntity>,
    @InjectRepository(ClassProficiencyEntity)
    private readonly classProfRepo: Repository<ClassProficiencyEntity>,
    @InjectRepository(SpellEntity)
    private readonly spellRepo: Repository<SpellEntity>,
  ) {}

  async getActions(
    userId: string,
    characterId: string,
  ): Promise<ActionsResponse> {
    const character = await ensureCharacterReadAccess(
      this.characterRepo,
      userId,
      characterId,
      this.partyMemberRepo,
      ["character_origin"],
    );

    const [
      charClasses,
      charAbilities,
      charProfs,
      charSpells,
      charEquip,
      charFeatures,
      charState,
    ] = await Promise.all([
      this.charClassRepo.find({
        where: { character_id: characterId },
        order: { order: "ASC" },
      }),
      this.charAbilityRepo.find({ where: { character_id: characterId } }),
      this.charProfRepo.find({ where: { character_id: characterId } }),
      this.charSpellRepo.find({ where: { character_id: characterId } }),
      this.charEquipRepo.find({ where: { character_id: characterId } }),
      this.charFeatureRepo.find({ where: { character_id: characterId } }),
      this.charStateRepo.findOne({ where: { character_id: characterId } }),
    ]);

    const alwaysPreparedSpecs = getAlwaysPreparedPaladinSpells(
      charClasses,
      character.source?.code !== "PHB",
    );
    const existingSpellSlugs = new Set(
      charSpells.map((characterSpell) =>
        normalizePreparedSpellSlug(characterSpell.spell.slug),
      ),
    );
    const missingAlwaysPreparedSlugs = alwaysPreparedSpecs
      .map((spell) => spell.slug)
      .filter((slug) => !existingSpellSlugs.has(slug));
    if (missingAlwaysPreparedSlugs.length > 0) {
      const spellEntities = await this.spellRepo.find({
        where: { slug: In(missingAlwaysPreparedSlugs) },
      });
      const spellsBySlug = new Map(
        spellEntities.map((spell) => [
          normalizePreparedSpellSlug(spell.slug),
          spell,
        ]),
      );
      for (const spellSpec of alwaysPreparedSpecs) {
        if (existingSpellSlugs.has(spellSpec.slug)) continue;
        const spell = spellsBySlug.get(spellSpec.slug);
        if (!spell) continue;
        charSpells.push({
          id: `virtual:${characterId}:${spell.id}`,
          character_id: characterId,
          spell_id: spell.id,
          spell,
          source: SpellSourceEnum.Class,
          status: SpellStatusEnum.Prepared,
          always_prepared: true,
        } as CharacterSpellEntity);
        existingSpellSlugs.add(spellSpec.slug);
      }
    }


    const abilityMap = new Map<string, number>();
    for (const ca of charAbilities) {
      abilityMap.set(ca.ability_score.slug, ca.base_score + ca.bonus);
    }
    const mod = (slug: string) =>
      getAbilityModifier(abilityMap.get(slug) ?? 10);
    const totalLevel = charClasses.reduce((s, cc) => s + cc.class_level, 0);
    const profBonus = PROF_BONUS_BY_LEVEL[Math.min(totalLevel, 20)] ?? 2;


    const profSlugs = new Set(
      charProfs
        .filter(
          (cp) =>
            cp.proficiency.proficiency_type === ProficiencyTypeEnum.Weapon ||
            cp.proficiency.proficiency_type === ProficiencyTypeEnum.Other,
        )
        .map((cp) => cp.proficiency.slug),
    );

    const classIds = charClasses.map((cc) => cc.class_id);
    if (classIds.length > 0) {
      const classProfs = await this.classProfRepo
        .createQueryBuilder("cp")
        .innerJoinAndSelect("cp.proficiency", "p")
        .where("cp.class_id IN (:...classIds)", { classIds })
        .getMany();
      for (const cp of classProfs) {
        if (
          cp.proficiency.proficiency_type === ProficiencyTypeEnum.Weapon ||
          cp.proficiency.proficiency_type === ProficiencyTypeEnum.Other
        ) {
          profSlugs.add(cp.proficiency.slug);
        }
      }
    }


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


    const hasExtraAttack = charFeatures.some(
      (cf) => cf.feature?.slug?.includes("extra-attack") && cf.active,
    );
    const fighterClass = charClasses.find(
      (cc) => normalizeClassSlug(cc.class.slug) === "fighter",
    );
    let attackCount = 1;
    if (hasExtraAttack) {
      if (fighterClass) {
        const fl = fighterClass.class_level;
        attackCount = fl >= 20 ? 4 : fl >= 11 ? 3 : 2;
      } else {
        attackCount = 2;
      }
    }


    const spellSaveDc: Record<string, number> = {};
    const spellAttackBonus: Record<string, number> = {};
    for (const cc of charClasses) {
      const scAbility = getSpellcastingAbility(cc.class.slug);
      if (scAbility) {
        spellSaveDc[cc.class.slug] = 8 + profBonus + mod(scAbility);
        spellAttackBonus[cc.class.slug] = profBonus + mod(scAbility);
      }
    }

    let speed = character.character_origin?.race?.speed ?? 30;
    const hasEquippedArmorOrShield = charEquip.some(
      (ce) => ce.equipped && Boolean(ce.equipment?.armor_class),
    );
    const monkLevel =
      charClasses.find(
        (cc) => normalizeClassSlug(cc.class.slug) === "monk",
      )?.class_level ?? 0;
    if (monkLevel >= 2 && !hasEquippedArmorOrShield) {
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
    const barbarianLevel =
      charClasses.find(
        (cc) => normalizeClassSlug(cc.class.slug) === "barbarian",
      )?.class_level ?? 0;
    const heavyArmorSlugs = new Set([
      "chain-mail",
      "splint",
      "plate",
      "ring-mail",
    ]);
    const hasEquippedHeavyArmor = charEquip.some(
      (ce) =>
        ce.equipped &&
        heavyArmorSlugs.has(
          (ce.equipment?.slug ?? "")
            .toLowerCase()
            .replace(/-(?:phb|xphb|srd52)$/i, ""),
        ),
    );
    if (barbarianLevel >= 5 && !hasEquippedHeavyArmor) {
      speed += 10;
    }




    const masteryChoices = new Set<string>(
      character.character_origin?.weapon_mastery_choices ?? [],
    );

    const allActions: ActionBlock[] = [];


    this.buildWeaponActions(
      charEquip,
      equipCatMap,
      profSlugs,
      mod,
      profBonus,
      totalLevel,
      masteryChoices,
      allActions,
    );






    this.buildDrawStowActions(charEquip, allActions);


    this.buildUnarmedStrike(
      mod,
      profBonus,
      charClasses,
      charFeatures,
      allActions,
    );


    const includeUnmodeledSpells =
      character.data?.seedMode === "spell-lab" ||
      character.data?.devMode === "spell-lab";

    this.buildSpellActions(
      charSpells,
      charClasses,
      spellSaveDc,
      spellAttackBonus,
      totalLevel,
      includeUnmodeledSpells,
      allActions,
    );


    this.buildConsumableActions(charEquip, allActions);


    this.buildFeatureActions(
      charFeatures,
      charClasses,
      charState,
      profBonus,
      mod,
      character.source?.code !== "PHB",
      allActions,
    );


    this.buildRaceTraitActions(
      character,
      charState,
      totalLevel,
      profBonus,
      mod,
      allActions,
    );

    if (
      hasPhbFeralSenses({
        classes: charClasses.map((entry) => ({
          slug: entry.class.slug,
          level: entry.class_level,
        })),
        features: charFeatures.map((entry) => ({
          slug: entry.feature?.slug,
          active: entry.active,
          sourceCode: entry.feature?.source?.code,
        })),
      })
    ) {
      for (const action of allActions) {
        if (typeof action.attackBonus === "number") {
          action.ignoresInvisibleTargetDisadvantage = true;
        }
      }
    }


    const actions = allActions.filter((a) => a.timing === "action");
    const bonusActions = allActions.filter((a) => a.timing === "bonus_action");
    const reactions = allActions.filter((a) => a.timing === "reaction");
    const freeActions = allActions.filter((a) => a.timing === "free");

    return {
      actions,
      bonusActions,
      reactions,
      freeActions,
      movement: { speed },
      summary: {
        attackCount,
        hasExtraAttack,
        spellSaveDc,
        spellAttackBonus,
      },
    };
  }



  private buildWeaponActions(
    charEquip: CharacterEquipmentEntity[],
    equipCatMap: Map<string, Set<string>>,
    profSlugs: Set<string>,
    mod: (s: string) => number,
    profBonus: number,
    _totalLevel: number,
    masteryChoices: Set<string>,
    out: ActionBlock[],
  ) {
    const strMod = mod("str");
    const dexMod = mod("dex");

    for (const ce of charEquip) {
      const eq = ce.equipment;






      if (!ce.mainHand && !ce.offHand) continue;
      if (!eq.damage) continue;





      const dmg = eq.damage as {
        damage_dice?: string;
        damage_type?: { name?: string; index?: string };
        dice?: string;
        type?: string;
      };
      const damageDice = dmg.damage_dice ?? dmg.dice;
      if (!damageDice) continue;

      const props = (eq.properties ?? []) as Array<{
        name?: string;
        index?: string;
        slug?: string;
      }>;



      const propSlugs = props.map((p) => p.index ?? p.slug ?? "");
      const isFinesse = propSlugs.includes("finesse");
      const isTwoHanded = propSlugs.includes("two-handed");
      const isVersatile = propSlugs.includes("versatile");
      const isThrown = propSlugs.includes("thrown");
      const propNames = props.map((p) => p.name ?? "").filter(Boolean);

      const cats = equipCatMap.get(ce.equipment_id) ?? new Set<string>();
      const isRangedWeapon =
        cats.has("simple-ranged-weapons") ||
        cats.has("martial-ranged-weapons") ||
        propSlugs.includes("ammunition");

      let abilityMod: number;
      if (isFinesse) {
        abilityMod = Math.max(strMod, dexMod);
      } else if (isRangedWeapon) {
        abilityMod = dexMod;
      } else {
        abilityMod = strMod;
      }


      const isProficient =
        isEquipmentProficient(eq.slug, cats, profSlugs) === true;

      const attackBonus = abilityMod + (isProficient ? profBonus : 0);
      const damageType = dmg.damage_type?.name ?? dmg.type ?? "Unknown";
      const damageBonus = abilityMod;

      const range = eq.range as { normal?: number; long?: number } | null;
      let rangeStr = "5 ft";
      if (range && !(isThrown && !isRangedWeapon)) {
        if (range.long) {
          rangeStr = `${range.normal ?? 5}/${range.long} ft`;
        } else if (range.normal) {
          rangeStr = `${range.normal} ft`;
        }
      }



      const weaponMastery = eq.mastery as
        | { slug?: string; name?: string }
        | undefined;
      const masterySlug =
        weaponMastery?.slug && masteryChoices.has(eq.slug)
          ? weaponMastery.slug
          : undefined;

      const handSlot: "main" | "off" | null = ce.mainHand
        ? "main"
        : ce.offHand
          ? "off"
          : null;

      const action: ActionBlock = {
        id: `weapon-${ce.id}`,
        name: eq.name,
        timing: "action",
        source: "weapon",
        sourceLabel: isProficient ? "Arma (proficiente)" : "Arma",
        description: `Ataque com ${eq.name}. ${isTwoHanded ? "Requer duas maos." : ""}`,
        attackBonus,
        damage: {
          dice: damageDice,
          type: damageType,
          bonus: damageBonus,
        },
        range: rangeStr,
        properties: propNames,
        weaponSlug: eq.slug,
        weaponCategory: isRangedWeapon ? "ranged" : "melee",
        masterySlug,
        proficient: isProficient,
        handSlot,
      };

      if (isVersatile) {

        const versatileProp = props.find((p) => p.index === "versatile");
        const versatileText = (versatileProp as Record<string, unknown>)
          ?.description as string | undefined;
        const versatileDice = this.parseVersatileDice(
          versatileText,
          damageDice,
        );
        action.versatileDamage = {
          dice: versatileDice,
          type: damageType,
          bonus: damageBonus,
        };
      }

      out.push(action);


      if (
        isThrown &&
        !isRangedWeapon &&
        range &&
        (range.normal ?? 0) > 5
      ) {
        out.push({
          ...action,
          id: `weapon-thrown-${ce.id}`,
          name: `${eq.name} (Arremesso)`,
          description: `Arremessa ${eq.name}.`,
          range: `${range.normal ?? 20}/${range.long ?? 60} ft`,
          damage: {
            dice: damageDice,
            type: damageType,
            bonus: abilityMod,
          },
          versatileDamage: undefined,
        });
      }
    }
  }



  private buildDrawStowActions(
    charEquip: CharacterEquipmentEntity[],
    out: ActionBlock[],
  ) {
    const hasMainHand = charEquip.some((item) => item.mainHand);
    const hasOffHand = charEquip.some((item) => item.offHand);

    for (const ce of charEquip) {
      const eq = ce.equipment;
      const isShield =
        eq.slug?.includes("shield") ||
        eq.name?.toLowerCase().includes("shield");

      if (!eq.damage && !isShield) continue;

      const label = eq.name;
      if (ce.mainHand || ce.offHand) {
        out.push({
          id: `stow-${ce.id}`,
          name: `Guardar ${label}`,
          timing: "free",
          source: "base",
          sourceLabel: "Interação com objeto (1×/turno)",
          description: `Guarda ${label}. Libera a(s) mão(s) empunhando. RAW 2024: 1 free object interaction por turno.`,
        });
      } else {
        if (hasMainHand && hasOffHand) continue;
        out.push({
          id: `draw-${ce.id}`,
          name: `Sacar ${label}`,
          timing: "free",
          source: "base",
          sourceLabel: "Interação com objeto (1×/turno)",
          description: `Saca ${label} do inventário. RAW 2024: 1 free object interaction por turno.`,
          handSlot: hasMainHand ? "off" : "main",
        });
      }
    }
  }



  private buildUnarmedStrike(
    mod: (s: string) => number,
    profBonus: number,
    charClasses: CharacterClassEntity[],
    charFeatures: CharacterFeatureEntity[],
    out: ActionBlock[],
  ) {
    const strMod = mod("str");
    const dexMod = mod("dex");


    const monkClass = charClasses.find(
      (cc) => normalizeClassSlug(cc.class.slug) === "monk",
    );
    let martialArtsDie: string | null = null;
    if (monkClass) {
      const lvl = monkClass.class_level;
      if (lvl >= 17) martialArtsDie = "1d12";
      else if (lvl >= 11) martialArtsDie = "1d10";
      else if (lvl >= 5) martialArtsDie = "1d8";
      else martialArtsDie = "1d6";
    }

    const attackMod = monkClass ? Math.max(strMod, dexMod) : strMod;
    const attackBonus = attackMod + profBonus;
    const damageDice = martialArtsDie ?? "1";
    const damageBonus = attackMod;

    out.push({
      id: "unarmed-strike",
      name: "Ataque Desarmado",
      timing: "action",
      source: "base",
      sourceLabel: monkClass ? "Artes Marciais" : "Base",
      description: monkClass
        ? `Soco, chute ou cabeçada usando Artes Marciais (${martialArtsDie}).`
        : "Soco, chute ou cabecada. 1 + mod de Forca de dano de concussao.",
      attackBonus,
      damage: {
        dice: damageDice,
        type: "Bludgeoning",
        bonus: damageBonus,
      },
      range: "5 ft",
    });
  }



  private buildSpellActions(
    charSpells: CharacterSpellEntity[],
    charClasses: CharacterClassEntity[],
    spellSaveDc: Record<string, number>,
    spellAttackBonus: Record<string, number>,
    totalLevel: number,
    includeUnmodeledSpells: boolean,
    out: ActionBlock[],
  ) {

    const activeSpells = charSpells.filter(
      (cs) =>
        (cs.spell.level === 0 ||
          cs.status === "prepared" ||
          cs.status === SpellStatusEnum.Known ||
          cs.always_prepared) &&
        (includeUnmodeledSpells || !!getSpellAutomationEntry(cs.spell.slug)),
    );


    const primaryCaster = charClasses.find((cc) =>
      getSpellcastingAbility(cc.class.slug),
    );
    const defaultDc = primaryCaster ? spellSaveDc[primaryCaster.class.slug] : 0;
    const defaultAttackBonus = primaryCaster
      ? spellAttackBonus[primaryCaster.class.slug]
      : 0;

    for (const cs of activeSpells) {
      const spell = cs.spell;
      const automation = getSpellAutomationEntry(spell.slug);
      const normalizedSpellSlug = spell.slug
        .toLowerCase()
        .replace(/-(phb|xphb|srd52)$/, "");
      const castingTime = (spell.casting_time ?? "").toLowerCase();
      let timing: ActionTiming = "action";
      if (castingTime.includes("bonus")) timing = "bonus_action";
      else if (castingTime.includes("reaction")) timing = "reaction";




      const dmg = spell.damage as {
        damage_type?: { name?: string; index?: string } | string[] | string;
        damage_at_character_level?: Record<string, string>;
        damage_at_slot_level?: Record<string, string>;
      } | null;

      const dc = spell.dc as {
        dc_type?: { name?: string; index?: string } | string[];
        dc_success?: string;
      } | null;

      const extractDamageType = (
        raw: typeof dmg extends null ? never : typeof dmg,
      ): string => {
        if (!raw) return "Unknown";
        const t = raw.damage_type;
        if (!t) return "Unknown";
        if (Array.isArray(t)) return t[0] ?? "Unknown";
        if (typeof t === "string") return t;
        return t.name ?? t.index ?? "Unknown";
      };

      let damage: DamageBlock | undefined;
      if (dmg) {
        let dice = "";
        if (dmg.damage_at_character_level) {

          dice = this.getCantripDamage(
            dmg.damage_at_character_level,
            totalLevel,
          );
        } else if (dmg.damage_at_slot_level) {

          const levels = Object.keys(dmg.damage_at_slot_level).sort(
            (a, b) => +a - +b,
          );
          dice = levels.length > 0 ? dmg.damage_at_slot_level[levels[0]] : "";
        } else {


          const rawDesc = Array.isArray(spell.description)
            ? (spell.description as unknown[]).join(" ")
            : typeof spell.description === "string"
              ? spell.description
              : "";
          const match = rawDesc.match(/(\d+d\d+)\s+(?:\w+\s+)?damage/i);
          if (match) dice = match[1];
        }
        if (dice) {
          damage = {
            dice,
            type: extractDamageType(dmg),
          };
        }
      }
      if (!damage && normalizedSpellSlug === "spiritual-weapon") {
        damage = {
          dice: "1d8 + MOD",
          type: "Force",
        };
      }

      const description = Array.isArray(spell.description)
        ? (spell.description[0] ?? "")
        : typeof spell.description === "string"
          ? spell.description
          : "";


      const shortDesc =
        description.length > 150
          ? description.substring(0, 147) + "..."
          : description;

      const action: ActionBlock = {
        id: `spell-${spell.slug}`,
        name: spell.name,
        timing,
        source: "spell",
        sourceLabel:
          spell.level === 0
            ? "Truque"
            : cs.always_prepared
              ? `Magia Nivel ${spell.level} · Sempre preparada`
              : `Magia Nivel ${spell.level}`,
        description: shortDesc,
        range: spell.range ?? "Self",
        spellLevel: spell.level,
        requiresConcentration: automation?.automationTags.includes(
          "no_concentration",
        )
          ? false
          : (spell.concentration ?? false),
        isRitual: spell.ritual ?? false,
        castingTime: spell.casting_time,
        ...(automation
          ? {
              automationStatus: automation.status,
              behaviorKind: automation.behaviorKind,
              automationTags: automation.automationTags,
            }
          : {}),
      };



      const aoeRaw = spell.area_of_effect as
        | { type?: string; size?: number }
        | null
        | undefined;
      // Curated canonical shapes take precedence over stale imported rows.
      // This is especially important for self-origin cubes such as
      // Thunderwave, which older local data represented as a sphere.
      const canonicalAoe = getAoeShape({
        slug: spell.slug,
        area_of_effect: null,
      } as any);
      if (canonicalAoe) {
        const rangeStr = spell.range ?? "Self";
        const isSelf = rangeStr.toLowerCase().includes("self");
        action.aoe = {
          originType: isSelf ? "self" : "point",
          shape: canonicalAoe.kind,
          sizeFt: canonicalAoe.sizeFt,
          rangeFt: isSelf
            ? 0
            : parseActionRangeFeet(rangeStr),
          ...(normalizedSpellSlug === "fire-storm"
            ? { maxPlacements: 10 }
            : {}),
        };
      } else if (aoeRaw && aoeRaw.type && typeof aoeRaw.size === "number") {
        const validShapes = [
          "sphere",
          "cone",
          "line",
          "cube",
          "cylinder",
        ] as const;
        const shape = (validShapes as readonly string[]).includes(aoeRaw.type)
          ? (aoeRaw.type as (typeof validShapes)[number])
          : "sphere";
        const rangeStr = spell.range ?? "Self";
        const isSelf = rangeStr.toLowerCase().includes("self");
        const rangeFt = isSelf
          ? 0
          : parseActionRangeFeet(rangeStr);
        action.aoe = {
          originType: isSelf ? "self" : "point",
          shape,
          sizeFt: aoeRaw.size,
          rangeFt,
        };
      }

      if (!action.aoe && automation?.behaviorKind === "persistent_area") {
        const tileDef = getTileEffectDefinition(spell.slug);
        if (tileDef) {
          const rangeStr = spell.range ?? "Self";
          const isSelf =
            tileDef.auraFollowsCaster === true ||
            rangeStr.toLowerCase().includes("self");
          const rangeFt = isSelf
            ? 0
            : parseActionRangeFeet(rangeStr);
          action.aoe = {
            originType: isSelf ? "self" : "point",
            shape: tileDef.shapeKind,
            sizeFt: Math.max(
              5,
              tileDef.defaultRadiusCells(spell.level ?? 1) * 5,
            ),
            rangeFt,
          };
        }
      }

      if (spell.attack_type) {
        action.attackBonus = defaultAttackBonus;
      }

      if (damage) {
        if (
          normalizedSpellSlug === "chromatic-orb"
        ) {
          damage.type = "tipo à escolha";
        }
        action.damage = damage;
      }

      if (dc) {
        action.saveDc = defaultDc;
        const rawDcType = dc.dc_type;
        if (Array.isArray(rawDcType)) {
          action.saveAbility = rawDcType[0] ?? "";
        } else if (rawDcType && typeof rawDcType === "object") {
          action.saveAbility = rawDcType.index ?? rawDcType.name ?? "";
        } else {
          action.saveAbility = "";
        }
        if (
          dc.dc_success === "half" ||
          dc.dc_success === "none" ||
          dc.dc_success === "negates"
        ) {
          action.saveSuccess = dc.dc_success;
        }
      }

      out.push(action);
    }
  }



  private buildConsumableActions(
    charEquip: CharacterEquipmentEntity[],
    out: ActionBlock[],
  ) {
    for (const ce of charEquip) {
      const eq = ce.equipment;
      const effect = eq.consumable_effect as {
        type?: string;
        label?: string;
        dice?: string;
        damageType?: string;
        actionCost?: string;
        range?: number;
        saveDc?: Record<string, unknown>;
      } | null;

      if (!effect || !effect.label) continue;

      const timingMap: Record<string, ActionTiming> = {
        action: "action",
        bonus_action: "bonus_action",
        reaction: "reaction",
      };
      const timing = timingMap[effect.actionCost ?? "action"] ?? "action";

      const action: ActionBlock = {
        id: `consumable-${ce.id}`,
        itemSlug: eq.slug,
        name: `${eq.name} (${effect.label})`,
        timing,
        source: "consumable",
        sourceLabel: "Item Consumivel",
        description: `Usar ${eq.name}: ${effect.label}. Quantidade: ${ce.quantity}.`,
        uses: ce.quantity,
        usesMax: ce.quantity,
      };

      if (effect.dice) {
        action.damage = {
          dice: effect.dice,
          type:
            effect.damageType ??
            (effect.type === "healing" ? "Healing" : "Unknown"),
        };
      }

      if (effect.range) {
        action.range = `${effect.range} ft`;
      }

      out.push(action);
    }
  }



  private buildFeatureActions(
    charFeatures: CharacterFeatureEntity[],
    charClasses: CharacterClassEntity[],
    charState: CharacterStateEntity | null,
    profBonus: number,
    mod: (s: string) => number,
    is2024Rules: boolean,
    out: ActionBlock[],
  ) {
    const classMap = new Map(charClasses.map((cc) => [cc.class_id, cc]));


    const featureActionMap = this.getFeatureActionDefinitions(
      profBonus,
      mod,
      charClasses,
      is2024Rules,
    );




    const featureUsesUsed =
      (charState as unknown as { feature_uses_used?: Record<string, number> })
        ?.feature_uses_used ?? {};
    const SHARED_POOLS: Record<string, string> = {
      "cutting-words": "bardic-inspiration",
      "sacred-weapon": "channel-divinity",
      "abjure-foes": "channel-divinity",
    };
    const resolveUsesForDef = (actionDef: ActionBlock): ActionBlock => {
      const withWildResurgenceState =
        actionDef.id === "faithful-steed"
          ? {
              ...actionDef,
              faithfulSteedFreeCastUsed:
                (featureUsesUsed["faithful-steed-free-cast"] ?? 0) > 0,
            }
          : actionDef.id === "wild-resurgence"
          ? {
              ...actionDef,
              wildResurgenceSlotRecoveryUsed:
                (featureUsesUsed["wild-resurgence-slot-recovery"] ?? 0) > 0,
            }
          : actionDef;
      if (actionDef.uses == null || actionDef.usesMax == null)
        return withWildResurgenceState;
      const poolKey = SHARED_POOLS[actionDef.id] ?? actionDef.id;
      const used = [
        "flurry-of-blows",
        "patient-defense",
        "step-of-the-wind",
        "stunning-strike",
      ].includes(actionDef.id)
        ? (charState?.ki_points_used ?? 0)
        : (featureUsesUsed[poolKey] ?? 0);
      return {
        ...withWildResurgenceState,
        uses: Math.max(0, withWildResurgenceState.usesMax! - used),
      };
    };



    const emittedCanonicals = new Set<string>();

    for (const cf of charFeatures) {
      if (!cf.active || !cf.feature) continue;

      const slug = cf.feature.slug;

      const normalizedFeatureSlug = slug.toLowerCase();
      const selectedChoice =
        typeof cf.choices?.option === "string"
          ? cf.choices.option.toLowerCase()
          : null;
      const hasVolleyChoice =
        normalizedFeatureSlug === "volley-ranger-hunter-11-phb" ||
        (normalizedFeatureSlug.startsWith("multiattack-ranger-hunter-") &&
          normalizedFeatureSlug.endsWith("-phb") &&
          selectedChoice === "multiattack-volley");
      const rangerClass = charClasses.find(
        (entry) => normalizeClassSlug(entry.class.slug) === "ranger",
      );
      const isPhbHunter =
        rangerClass?.subclass?.slug?.toLowerCase() === "ranger-hunter-phb";
      const belongsToRangerClass =
        rangerClass != null && cf.source_class_id === rangerClass.class_id;
      if (
        hasVolleyChoice &&
        !is2024Rules &&
        rangerClass &&
        isPhbHunter &&
        belongsToRangerClass &&
        rangerClass.class_level >= 11
      ) {
        if (emittedCanonicals.has("volley-ranger-hunter-11-phb")) continue;
        const rangedWeapons = out.filter(
          (action) =>
            action.source === "weapon" &&
            action.timing === "action" &&
            action.weaponCategory === "ranged" &&
            typeof action.attackBonus === "number" &&
            action.damage != null,
        );
        for (const weapon of rangedWeapons) {
          const weaponRangeFt = this.parseMaximumWeaponRangeFeet(weapon.range);
          if (weaponRangeFt <= 0) continue;
          out.push({
            id: `feature-${cf.id}-volley-${weapon.id}`,
            name: `Saraivada (Volley) — ${weapon.name}`,
            timing: "action",
            source: "feature",
            sourceLabel: "Patrulheiro · Caçador",
            description:
              `Escolha um ponto no alcance de ${weapon.name} e faça um ataque separado contra cada criatura escolhida a até 10 pés dele. ` +
              "Consome uma única Ação. Limitação atual: munição e linha de visão não são rastreadas pelo mapa.",
            attackBonus: weapon.attackBonus,
            damage: weapon.damage,
            range: weapon.range,
            properties: weapon.properties,
            weaponSlug: weapon.weaponSlug,
            weaponActionSlug: weapon.id,
            weaponCategory: "ranged",
            featureSlug: "volley-ranger-hunter-11-phb",
            aoe: {
              originType: "point",
              shape: "sphere",
              sizeFt: 10,
              rangeFt: weaponRangeFt,
            },
          });
        }
        emittedCanonicals.add("volley-ranger-hunter-11-phb");
        continue;
      }


      const classification = classifyFeatureForActions(slug);
      if (classification?.kind === "hide") {



        continue;
      }


      const effectiveSlug =
        classification?.kind === "alias" && classification.canonicalSlug
          ? classification.canonicalSlug
          : slug;



      if (
        emittedCanonicals.has(effectiveSlug)
      ) {
        continue;
      }

      const mapped = featureActionMap.get(effectiveSlug);

      if (mapped) {

        for (const actionDef of mapped) {
          if (
            actionDef.id === "moonlight-step-recover" &&
            (featureUsesUsed["moonlight-step"] ?? 0) <= 0
          ) {
            continue;
          }

          const withUses = resolveUsesForDef(actionDef);
          out.push({
            ...withUses,
            id: `feature-${cf.id}-${actionDef.id}`,

            featureSlug: actionDef.id,
          });
        }
        emittedCanonicals.add(effectiveSlug);
        continue;
      }



      if (classification?.kind === "alias") {
        continue;
      }


      const desc = cf.feature.description;
      const descText = Array.isArray(desc)
        ? desc[0]
        : typeof desc === "string"
          ? desc
          : "";

      if (descText && typeof descText === "string") {

        const isAction =
          /action|bonus action|reaction|use|activate|expend/i.test(descText);
        if (!isAction) continue;

        let timing: ActionTiming = "action";
        if (/bonus action/i.test(descText)) timing = "bonus_action";
        else if (/reaction/i.test(descText)) timing = "reaction";

        const shortDesc =
          descText.length > 150 ? descText.substring(0, 147) + "..." : descText;

        out.push({
          id: `feature-${cf.id}`,
          name: cf.feature.name,
          timing,
          source: "feature",
          sourceLabel:
            (cf.source_class_id
              ? classMap.get(cf.source_class_id)?.class.name
              : undefined) ?? "Classe",
          description: shortDesc,

          featureSlug: slug,
        });
      }
    }
  }

  private parseMaximumWeaponRangeFeet(
    range: string | null | undefined,
  ): number {
    const values = String(range ?? "")
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter(Number.isFinite);
    return values?.length ? Math.max(...values) : 0;
  }





  private buildRaceTraitActions(
    character: CharacterEntity,
    charState: CharacterStateEntity | null,
    totalLevel: number,
    profBonus: number,
    mod: (s: string) => number,
    out: ActionBlock[],
  ) {
    const origin = character.character_origin;
    if (!origin) return;

    const raceSlug = (origin.race?.slug ?? "")
      .toLowerCase()
      .replace(/-(?:phb|xphb|srd52)$/i, "");
    const traitChoices: string[] = origin.race_trait_choices ?? [];

    if (raceSlug === "goliath") {
      const giantAncestry = findGiantAncestryChoice(traitChoices);
      const ancestryUsesMax = profBonus;
      const ancestryUsesUsed =
        charState?.feature_uses_used?.["giant-ancestry"] ?? 0;
      const ancestryUses = Math.max(
        0,
        ancestryUsesMax - ancestryUsesUsed,
      );
      if (giantAncestry === "clouds-jaunt") {
        out.push({
          id: "clouds-jaunt",
          name: "Salto das Nuvens",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Golias · Ancestralidade Gigante",
          description:
            `Teleporte-se magicamente até 30 ft para um espaço desocupado que você possa ver. ` +
            `${ancestryUses}/${ancestryUsesMax} usos compartilhados por descanso longo.`,
          featureSlug: "clouds-jaunt",
          range: "30 ft",
          uses: ancestryUses,
          usesMax: ancestryUsesMax,
          usesRecharge: "long_rest",
        });
      }
      if (totalLevel >= 5) {
        const usesMax = 1;
        const usesUsed =
          charState?.feature_uses_used?.["large-form"] ?? 0;
        const uses = Math.max(0, usesMax - usesUsed);
        out.push({
          id: "large-form",
          name: "Forma Grande",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Golias",
          description:
            `Torna-se Grande por 10 minutos: vantagem em testes de FOR e +10 ft de deslocamento. ` +
            `Pode encerrar sem ação. ${uses}/${usesMax} uso por descanso longo.`,
          featureSlug: "large-form",
          uses,
          usesMax,
          usesRecharge: "long_rest",
        });
      }
      return;
    }

    if (raceSlug === "aasimar") {
      const healingHandsUsesMax = 1;
      const healingHandsUsesUsed =
        charState?.feature_uses_used?.["healing-hands"] ?? 0;
      out.push({
        id: "healing-hands",
        name: "Mãos Curativas",
        timing: "action",
        source: "feature",
        sourceLabel: "Aasimar",
        description:
          `Toque uma criatura e role ${profBonus}d4; ela recupera os PV rolados. ` +
          "Um uso por descanso longo.",
        featureSlug: "healing-hands",
        range: "5 ft",
        uses: Math.max(0, healingHandsUsesMax - healingHandsUsesUsed),
        usesMax: healingHandsUsesMax,
        usesRecharge: "long_rest",
      });
      if (totalLevel >= 3) {
        const revelationUsesMax = 1;
        const revelationUsesUsed =
          charState?.feature_uses_used?.["celestial-revelation"] ?? 0;
        out.push({
          id: "celestial-revelation",
          name: "Revelação Celestial",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Aasimar",
          description:
            "Transforme-se por 1 minuto escolhendo Asas Celestiais, Radiância Interior ou Manto Necrótico. Cada forma também causa dano extra uma vez por turno.",
          featureSlug: "celestial-revelation",
          uses: Math.max(0, revelationUsesMax - revelationUsesUsed),
          usesMax: revelationUsesMax,
          usesRecharge: "long_rest",
        });
      }
      return;
    }

    if (raceSlug === "orc") {
      const usesMax = profBonus;
      const usesUsed =
        charState?.feature_uses_used?.["adrenaline-rush"] ?? 0;
      out.push({
        id: "adrenaline-rush",
        name: "Adrenaline Rush",
        timing: "bonus_action",
        source: "feature",
        sourceLabel: "Orc",
        description:
          `Use Disparada como Ação Bônus e receba ${profBonus} PV temporários. ` +
          `${Math.max(0, usesMax - usesUsed)}/${usesMax} usos por descanso curto ou longo.`,
        featureSlug: "adrenaline-rush",
        uses: Math.max(0, usesMax - usesUsed),
        usesMax,
        usesRecharge: "short_rest",
      });
      return;
    }

    if (raceSlug !== "dragonborn") return;

    const dragonColor = traitChoices.find((c) => DRACONIC_ANCESTRY_MAP[c]);
    if (!dragonColor) return;

    const damageType = DRACONIC_ANCESTRY_MAP[dragonColor].damageType;
    const damageDice =
      totalLevel >= 17
        ? "4d10"
        : totalLevel >= 11
          ? "3d10"
          : totalLevel >= 5
            ? "2d10"
            : "1d10";
    const saveDc = 8 + mod("con") + profBonus;
    const usesMax = profBonus;
    const usesUsed = charState?.feature_uses_used?.["breath-weapon"] ?? 0;
    const uses = Math.max(0, usesMax - usesUsed);

    const dragonName =
      dragonColor.charAt(0).toUpperCase() + dragonColor.slice(1);

    const common: Pick<
      ActionBlock,
      | "timing"
      | "source"
      | "sourceLabel"
      | "damage"
      | "saveDc"
      | "saveAbility"
      | "saveSuccess"
      | "featureSlug"
      | "uses"
      | "usesMax"
      | "usesRecharge"
    > = {
      timing: "action",
      source: "feature",
      sourceLabel: "Dragonborn",
      damage: { dice: damageDice, type: damageType },
      saveDc,
      saveAbility: "DES",
      saveSuccess: "half",
      featureSlug: "breath-weapon",
      uses,
      usesMax,
      usesRecharge: "long_rest",
    };

    out.push(
      {
        ...common,
        id: "breath-weapon-cone",
        name: `Sopro de Dragao — Cone (${dragonName})`,
        description: `Exala ${damageType} em cone de 15 ft. Cada criatura na area faz save de DES (DC ${saveDc}). Falha: ${damageDice} dano ${damageType}. Sucesso: metade. ${uses}/${usesMax} usos por descanso longo.`,
        range: "15 ft cone",
        aoe: {
          originType: "self",
          shape: "cone",
          sizeFt: 15,
          rangeFt: 0,
        },
      },
      {
        ...common,
        id: "breath-weapon-line",
        name: `Sopro de Dragao — Linha (${dragonName})`,
        description: `Exala ${damageType} em linha de 30x5 ft. Cada criatura na area faz save de DES (DC ${saveDc}). Falha: ${damageDice} dano ${damageType}. Sucesso: metade. ${uses}/${usesMax} usos por descanso longo.`,
        range: "30 ft line",
        aoe: {
          originType: "self",
          shape: "line",
          sizeFt: 30,
          rangeFt: 0,
        },
      },
    );
  }



  private getFeatureActionDefinitions(
    profBonus: number,
    mod: (s: string) => number,
    charClasses: CharacterClassEntity[],
    is2024Rules: boolean,
  ): Map<string, ActionBlock[]> {
    const map = new Map<string, ActionBlock[]>();
    const conMod = mod("con");
    const strMod = mod("str");
    const wisMod = mod("wis");
    const chaMod = mod("cha");


    const fighterClass = charClasses.find(
      (cc) => normalizeClassSlug(cc.class.slug) === "fighter",
    );
    if (fighterClass) {
      const secondWindMax = getSecondWindMaxUses(
        fighterClass.class_level,
        is2024Rules,
      );
      map.set("second-wind", [
        {
          id: "second-wind",
          name: "Retomar Folego (Second Wind)",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Guerreiro",
          description: `Recupera 1d10+${fighterClass.class_level} HP. ${secondWindMax} usos; recupera 1 uso por descanso curto e todos no descanso longo.`,
          damage: { dice: `1d10+${fighterClass.class_level}`, type: "Healing" },
          uses: secondWindMax,
          usesMax: secondWindMax,
          usesRecharge: "short_rest",
        },
      ]);

      map.set("action-surge", [
        {
          id: "action-surge",
          name: "Surto de Acao (Action Surge)",
          timing: "free",
          source: "feature",
          sourceLabel: "Guerreiro",
          description:
            "Ganha uma acao adicional neste turno. 1 uso por descanso curto/longo.",
          uses: fighterClass.class_level >= 17 ? 2 : 1,
          usesMax: fighterClass.class_level >= 17 ? 2 : 1,
          usesRecharge: "short_rest",
        },
      ]);



      if (fighterClass.class_level >= 9) {
        const indomitableUses =
          fighterClass.class_level >= 17
            ? 3
            : fighterClass.class_level >= 13
              ? 2
              : 1;
        map.set("indomitable", [
          {
            id: "indomitable",
            name: "Indomavel (Indomitable)",
            timing: "reaction",
            source: "feature",
            sourceLabel: "Guerreiro",
            description: `Re-rola um teste de resistencia falho. ${indomitableUses} uso${indomitableUses > 1 ? "s" : ""} por descanso longo.`,
            uses: indomitableUses,
            usesMax: indomitableUses,
            usesRecharge: "long_rest",
          },
        ]);
      }
    }


    const barbarianClass = charClasses.find(
      (cc) => cc.class.slug === "barbarian",
    );
    if (barbarianClass) {
      const rages =
        barbarianClass.class_level >= 17
          ? 6
          : barbarianClass.class_level >= 12
            ? 5
            : barbarianClass.class_level >= 6
              ? 4
              : barbarianClass.class_level >= 3
                ? 3
                : 2;
      const rageDmg =
        barbarianClass.class_level >= 16
          ? 4
          : barbarianClass.class_level >= 9
            ? 3
            : 2;

      map.set("rage", [
        {
          id: "rage",
          name: "Furia (Rage)",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Barbaro",
          description: `Entra em furia. +${rageDmg} dano melee com FOR, resistencia a dano de concussao/perfuracao/cortante, vantagem em testes de FOR. ${rages} usos por descanso longo.`,
          uses: rages,
          usesMax: rages,
          usesRecharge: "long_rest",
        },
      ]);

      map.set("reckless-attack", [
        {
          id: "reckless-attack",
          name: "Ataque Imprudente (Reckless Attack)",
          timing: "free",
          source: "feature",
          sourceLabel: "Barbaro",
          description:
            "No primeiro ataque do turno com FOR: Vantagem no ataque, porem ataques contra voce tem Vantagem ate o proximo turno.",
        },
      ]);
    }


    const rogueClass = charClasses.find((cc) => cc.class.slug === "rogue");
    if (rogueClass) {
      const sneakDice = Math.ceil(rogueClass.class_level / 2);
      map.set("sneak-attack", [
        {
          id: "sneak-attack",
          name: "Ataque Furtivo (Sneak Attack)",
          timing: "free",
          source: "feature",
          sourceLabel: "Ladino",
          description: `${sneakDice}d6 dano extra com arma Finesse/Distancia quando tem Vantagem ou aliado a 5 ft do alvo. 1x por turno.`,
          damage: { dice: `${sneakDice}d6`, type: "Extra" },
        },
      ]);

      map.set("cunning-action", [
        {
          id: "cunning-action-dash",
          name: "Acao Ardilosa: Disparada",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Ladino",
          description: "Usa Disparada como acao bonus.",
        },
        {
          id: "cunning-action-disengage",
          name: "Acao Ardilosa: Retirada",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Ladino",
          description: "Usa Retirada como acao bonus.",
        },
        {
          id: "cunning-action-hide",
          name: "Acao Ardilosa: Esconder",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Ladino",
          description: "Usa Esconder como acao bonus.",
        },
      ]);

      if (rogueClass.class_level >= 3) {
        map.set("steady-aim", [
          {
            id: "steady-aim",
            name: "Mira Firme (Steady Aim)",
            timing: "bonus_action",
            source: "feature",
            sourceLabel: "Ladino",
            description:
              "Se ainda não se moveu neste turno, zera seu deslocamento e concede Vantagem ao próximo ataque deste turno.",
          },
        ]);
      }
    }


    const monkClass = charClasses.find(
      (cc) => normalizeClassSlug(cc.class.slug) === "monk",
    );
    if (monkClass) {
      const kiPoints = monkClass.class_level;
      map.set("flurry-of-blows", [
        {
          id: "flurry-of-blows",
          name: "Rajada de Golpes (Flurry of Blows)",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Monge",
          description: `Gasta 1 ponto de Ki para fazer 2 ataques desarmados como acao bonus. ${kiPoints} pontos de Ki por descanso curto/longo.`,
          uses: kiPoints,
          usesMax: kiPoints,
          usesRecharge: "short_rest",
        },
      ]);

      map.set("patient-defense", [
        {
          id: "patient-defense-disengage",
          name: "Defesa Paciente: Desengajar",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Monge",
          description: "Usa Desengajar como acao bonus sem gastar Foco.",
        },
        {
          id: "patient-defense",
          name: "Defesa Paciente: Desengajar + Esquivar",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Monge",
          description:
            "Gasta 1 ponto de Foco para usar Desengajar e Esquivar como acao bonus.",
          uses: kiPoints,
          usesMax: kiPoints,
          usesRecharge: "short_rest",
        },
      ]);

      map.set("step-of-the-wind", [
        {
          id: "step-of-the-wind-dash",
          name: "Passo do Vento: Disparada",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Monge",
          description: "Usa Disparada como acao bonus sem gastar Foco.",
        },
        {
          id: "step-of-the-wind",
          name: "Passo do Vento: Disparada + Desengajar",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Monge",
          description:
            "Gasta 1 ponto de Foco para usar Disparada e Desengajar como acao bonus; a distancia de salto dobra neste turno.",
          uses: kiPoints,
          usesMax: kiPoints,
          usesRecharge: "short_rest",
        },
      ]);


      map.set("martial-arts", [
        {
          id: "martial-arts-bonus",
          name: "Artes Marciais: Ataque Bonus",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Monge",
          description:
            "Faz um ataque desarmado como acao bonus.",
        },
      ]);




      if (monkClass.class_level >= 5) {
        const stunDc = 8 + profBonus + wisMod;
        map.set("stunning-strike", [
          {
            id: "stunning-strike",
            name: "Golpe Atordoante (Stunning Strike)",
            timing: "free",
            source: "feature",
            sourceLabel: "Monge",
            description: `Apos acertar ataque desarmado, gasta 1 Ki: alvo rola CON save (DC ${stunDc}). Falha = Stunned ate o fim do seu proximo turno.`,
            saveDc: stunDc,
            saveAbility: "CON",
            uses: kiPoints,
            usesMax: kiPoints,
            usesRecharge: "short_rest",
          },
        ]);
      }
    }


    const clericClass = charClasses.find((cc) => cc.class.slug === "cleric");
    if (clericClass) {
      map.set("channel-divinity", [
        {
          id: "channel-divinity",
          name: "Canalizar Divindade (Channel Divinity)",
          timing: "action",
          source: "feature",
          sourceLabel: "Clerigo",
          description: `Usa seu poder divino canalizado. ${clericClass.class_level >= 6 ? 2 : 1} uso(s) por descanso curto/longo.`,
          uses: clericClass.class_level >= 6 ? 2 : 1,
          usesMax: clericClass.class_level >= 6 ? 2 : 1,
          usesRecharge: "short_rest",
        },
      ]);
    }


    const paladinClass = charClasses.find((cc) => cc.class.slug === "paladin");
    if (paladinClass) {
      const divineSenseUses = Math.max(1, 1 + chaMod);
      map.set("divine-sense", [
        {
          id: "divine-sense",
          name: "Sentido Divino (Divine Sense)",
          timing: is2024Rules ? "bonus_action" : "action",
          source: "feature",
          sourceLabel: "Paladino",
          description:
            "Por 10 minutos, detecta Celestiais, Corruptores e Mortos-Vivos a até 60 pés que não estejam atrás de cobertura total.",
          uses: divineSenseUses,
          usesMax: divineSenseUses,
          usesRecharge: "long_rest",
        },
      ]);

      const channelDivinityUses = is2024Rules ? 2 : 1;
      map.set("sacred-weapon", [
        {
          id: "sacred-weapon",
          name: "Arma Sagrada (Sacred Weapon)",
          timing: is2024Rules ? "free" : "action",
          source: "feature",
          sourceLabel: "Paladino · Devoção",
          description: is2024Rules
            ? "Ao iniciar a ação Atacar, gasta Canalizar Divindade e adiciona Carisma (mínimo +1) aos ataques com a arma empunhada por 10 minutos."
            : "Gasta uma ação e Canalizar Divindade para adicionar Carisma aos ataques com a arma empunhada por 1 minuto.",
          uses: channelDivinityUses,
          usesMax: channelDivinityUses,
          usesRecharge: "short_rest",
        },
      ]);

      if (is2024Rules && paladinClass.class_level >= 9) {
        const maxTargets = Math.max(1, chaMod);
        const saveDc = 8 + profBonus + chaMod;
        map.set("abjure-foes", [
          {
            id: "abjure-foes",
            name: "Abjurar Inimigos (Abjure Foes)",
            timing: "action",
            source: "feature",
            sourceLabel: "Paladino",
            description:
              `Escolha até ${maxTargets} criatura(s) a 60 pés. Cada alvo faz resistência de SAB CD ${saveDc}; ` +
              "na falha fica Amedrontado por 1 minuto ou até sofrer dano e, no próprio turno, escolhe apenas Movimento, Ação ou Ação Bônus.",
            saveDc,
            saveAbility: "WIS",
            range: "60 ft",
            uses: channelDivinityUses,
            usesMax: channelDivinityUses,
            usesRecharge: "short_rest",
          },
        ]);
      }

      if (is2024Rules && paladinClass.class_level >= 5) {
        map.set("faithful-steed", [
          {
            id: "faithful-steed",
            name: "Corcel Fiel (Find Steed)",
            timing: "action",
            source: "feature",
            sourceLabel: "Paladino · Magia sempre preparada",
            description:
              "Conjura Find Steed a até 30 pés. Uma conjuração gratuita por descanso longo; depois disso, pode gastar um slot de nível 2 ou maior.",
            range: "30 ft",
          },
        ]);
      }

      map.set("lay-on-hands", [
        {
          id: "lay-on-hands",
          name: "Imposicao de Maos (Lay on Hands)",
          timing: is2024Rules ? "bonus_action" : "action",
          source: "feature",
          sourceLabel: "Paladino",
          description:
            `Pool de cura: ${paladinClass.class_level * 5} HP. Toque para curar` +
            (is2024Rules
              ? paladinClass.class_level >= 14
                ? " ou gaste 5 PV do pool por condição removida: Cego, Enfeitiçado, Surdo, Amedrontado, Paralisado, Envenenado ou Atordoado."
                : " ou gaste 5 PV do pool para remover Envenenado."
              : " ou gaste 5 PV do pool para curar uma doença ou neutralizar um veneno."),
          damage: { dice: `${paladinClass.class_level * 5}`, type: "Healing" },
          uses: paladinClass.class_level * 5,
          usesMax: paladinClass.class_level * 5,
          usesRecharge: "long_rest",
        },
      ]);
    }


    const druidClass = charClasses.find((cc) => cc.class.slug === "druid");
    if (druidClass && druidClass.class_level >= 2) {
      const wildShapeUses = getWildShapeUses(
        druidClass.class_level,
        is2024Rules,
      );
      const wildShapeUsesLabel =
        wildShapeUses >= 9999 ? "Usos ilimitados" : `${wildShapeUses} usos`;
      map.set("wild-shape", [
        {
          id: "wild-shape",
          name: "Forma Selvagem (Wild Shape)",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Druida",
          description: `Transforma-se em uma fera. ${wildShapeUsesLabel} por descanso curto/longo.`,
          uses: wildShapeUses,
          usesMax: wildShapeUses,
          usesRecharge: "short_rest",
        },
      ]);
      if (is2024Rules) {
        map.set("wild-companion", [
          {
            id: "wild-companion",
            name: "Companheiro Selvagem (Wild Companion)",
            timing: "action",
            source: "feature",
            sourceLabel: "Druida",
            description:
              "Conjura Find Familiar sem componentes materiais. Gaste um slot de magia ou um uso de Forma Selvagem; o familiar é Feérico e dura até o próximo descanso longo.",
          },
        ]);
        if (druidClass.class_level >= 5) {
          map.set("wild-resurgence", [
            {
              id: "wild-resurgence",
              name: "Ressurgência Selvagem (Wild Resurgence)",
              timing: "free",
              source: "feature",
              sourceLabel: "Druida",
              description:
                "Sem ação: troque um slot por um uso de Forma Selvagem quando estiver sem usos (1× por turno), ou troque um uso por um slot de nível 1 (1× por descanso longo).",
            },
          ]);
        }
        if (druidClass.class_level >= 10) {
          const moonlightStepMax = Math.max(1, wisMod);
          map.set("moonlight-step", [
            {
              id: "moonlight-step",
              name: "Passo ao Luar",
              timing: "bonus_action",
              source: "feature",
              sourceLabel: "Druida · Círculo da Lua",
              description:
                `Teleporte-se até 30 pés para um espaço desocupado e tenha Vantagem no próximo ataque antes do fim deste turno. ` +
                `${moonlightStepMax} usos por descanso longo.`,
              range: "30 ft",
              uses: moonlightStepMax,
              usesMax: moonlightStepMax,
              usesRecharge: "long_rest",
            },
            {
              id: "moonlight-step-recover",
              name: "Recuperar Passo ao Luar",
              timing: "free",
              source: "feature",
              sourceLabel: "Druida · Círculo da Lua",
              description:
                "Sem ação: gaste um slot de magia de nível 2 ou maior para recuperar um uso de Passo ao Luar.",
            },
          ]);
        }
      }
    }


    const sorcererClass = charClasses.find(
      (cc) => cc.class.slug === "sorcerer",
    );
    if (sorcererClass) {
      map.set("font-of-magic", [
        {
          id: "font-of-magic",
          name: "Fonte de Magia (Font of Magic)",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Feiticeiro",
          description: `${sorcererClass.class_level} pontos de feiticaria. Converte spell slots em pontos ou pontos em slots.`,
          uses: sorcererClass.class_level,
          usesMax: sorcererClass.class_level,
          usesRecharge: "long_rest",
        },
      ]);
    }


    const warlockClass = charClasses.find(
      (cc) => normalizeClassSlug(cc.class.slug) === "warlock",
    );
    if (warlockClass) {
      map.set("eldritch-invocations", [
        {
          id: "eldritch-invocations",
          name: "Invocacoes Misticas",
          timing: "free",
          source: "feature",
          sourceLabel: "Bruxo",
          description:
            "Suas invocacoes misticas concedem habilidades passivas e ativas. Verifique suas invocacoes para detalhes.",
        },
      ]);
    }


    const wizardClass = charClasses.find((cc) => cc.class.slug === "wizard");
    if (wizardClass && wizardClass.class_level >= 2) {
      map.set("arcane-recovery", [
        {
          id: "arcane-recovery",
          name: "Recuperacao Arcana (Arcane Recovery)",
          timing: "action",
          source: "feature",
          sourceLabel: "Mago",
          description: `Uma vez por dia durante descanso curto, recupera spell slots com niveis que somam ate ${Math.ceil(wizardClass.class_level / 2)} (nenhum 6o nivel ou acima).`,
          uses: 1,
          usesMax: 1,
          usesRecharge: "long_rest",
        },
      ]);
    }


    const bardClass = charClasses.find((cc) => cc.class.slug === "bard");
    if (bardClass) {
      const inspirationDie =
        bardClass.class_level >= 15
          ? "d12"
          : bardClass.class_level >= 10
            ? "d10"
            : bardClass.class_level >= 5
              ? "d8"
              : "d6";
      const uses = Math.max(1, chaMod);





      if (bardClass.class_level >= 3) {
        map.set("cutting-words", [
          {
            id: "cutting-words",
            name: "Palavras Cortantes",
            timing: "reaction",
            source: "feature",
            sourceLabel: "Bardo · Lore",
            description: `Reação: criatura visível em 60ft faz attack/check/damage roll. Gasta 1 uso de Inspiração Bárdica; o alvo subtrai 1${inspirationDie} do resultado.`,
            uses,
            usesMax: uses,
            usesRecharge:
              bardClass.class_level >= 5 ? "short_rest" : "long_rest",
          },
        ]);
      }
      if (bardClass.class_level >= 5) {
        map.set("countercharm", [
          {
            id: "countercharm",
            name: "Contrafeitiço",
            timing: "reaction",
            source: "feature",
            sourceLabel: "Bardo",
            description:
              "Reação: criatura em 30ft que falhou save vs Charmed/Frightened re-rola o save.",
          },
        ]);
      }

      map.set("bardic-inspiration", [
        {
          id: "bardic-inspiration",
          name: "Inspiracao Bardica",
          timing: "bonus_action",
          source: "feature",
          sourceLabel: "Bardo",
          description: `Da um ${inspirationDie} de Inspiracao Bardica a um aliado a 60 ft. ${uses} uso(s) por descanso ${bardClass.class_level >= 5 ? "curto" : "longo"}.`,
          uses,
          usesMax: uses,
          usesRecharge: bardClass.class_level >= 5 ? "short_rest" : "long_rest",
        },
      ]);
    }


    const rangerClass = charClasses.find((cc) => cc.class.slug === "ranger");
    if (rangerClass && rangerClass.class_level >= 3) {
      map.set("dreadful-strikes", [
        {
          id: "dreadful-strikes",
          name: "Golpes Pavorosos",
          timing: "free",
          source: "feature",
          sourceLabel: "Patrulheiro",
          description: `1x por turno ao acertar ataque com arma: +1d${rangerClass.class_level >= 11 ? "8" : "6"} dano psiquico extra.`,
        },
      ]);
    }

    return map;
  }



  private parseVersatileDice(
    text: string | undefined,
    baseDice: string,
  ): string {
    if (!text) {

      const match = baseDice.match(/(\d+)d(\d+)/);
      if (!match) return baseDice;
      const dieSize = parseInt(match[2], 10);
      const nextDie = { 4: 6, 6: 8, 8: 10, 10: 12, 12: 12 }[dieSize] ?? dieSize;
      return `${match[1]}d${nextDie}`;
    }

    const diceMatch = text.match(/(\d+d\d+)/);
    return diceMatch
      ? diceMatch[1]
      : this.parseVersatileDice(undefined, baseDice);
  }

  private getCantripDamage(
    table: Record<string, string>,
    totalLevel: number,
  ): string {
    const levels = Object.keys(table)
      .map(Number)
      .sort((a, b) => a - b);

    let dice = "";
    for (const lvl of levels) {
      if (totalLevel >= lvl) {
        dice = table[String(lvl)];
      }
    }
    return dice;
  }
}
