import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, IsNull, Repository } from "typeorm";
import {
  CharacterEntity,
  CharacterClassEntity,
  CharacterAbilityScoreEntity,
  CharacterStateEntity,
  CharacterLevelUpEntity,
  CharacterFeatureEntity,
  CharacterSpellEntity,
  CharacterProficiencyEntity,
  ClassEntity,
  LevelEntity,
  SubclassEntity,
  SpellEntity,
  SpellClassEntity,
  ProficiencyEntity,
  FeatureEntity,
} from "src/entities";
import {
  HpMethodEnum,
  SpellSourceEnum,
  SpellStatusEnum,
  CharacterProficiencySourceEnum,
} from "src/entities/enums";
import {
  XP_THRESHOLDS,
  CasterClassType,
  FULL_CASTER_SLOTS,
  getCasterClassType,
  getSpellcastingAbility,
  normalizeClassSlug,
} from "src/shared/srd-constants";
import { getAbilityModifier } from "src/shared/srd-utils";
import {
  ensureCharacterOwnership,
  getCharacterState,
} from "src/shared/character-guard";
import {
  type EditionRules,
  getSubclassLevel as getSubclassLevelFromRules,
  getPreparedFormula,
} from "src/shared/edition-rules";
import {
  isClassAvailable,
  getCanonicalSubclassSlugs,
} from "src/shared/class-availability";
import { Logger } from "@nestjs/common";

type CasterType = CasterClassType;

// Multiclass prerequisites: ability scores required (slug -> minimum)
interface MulticlassPrereq {
  abilityScoreSlug: string;
  minimumScore: number;
}

// ---- DTOs ----

export interface LevelUpOptionsResult {
  currentLevel: number;
  newLevel: number;
  xp: number;
  xpRequired: number;
  canLevelUp: boolean;

  availableClasses: AvailableClassOption[];
  hitDie: Record<string, number>;
}

export interface AvailableClassOption {
  slug: string; // canonical: 'fighter' (no suffix)
  sourceQualifiedSlug: string; // ClassEntity.slug actually used: 'fighter-phb' or 'fighter'
  featureSourceFallback?: string; // Spec 005: 'XPHB' when PHB LevelEntity was missing
  name: string;
  isCurrentClass: boolean;
  isMulticlass: boolean; // true when picking this class would create a new CharacterClass
  hitDie: number;
  meetsPrerequisites: boolean;
  prerequisites: MulticlassPrereq[];
  missingPrerequisites: MissingPrerequisite[];
  nextLevel: number;
  hasAsi: boolean;
  hasSubclass: boolean;
  availableSubclasses: Array<{ slug: string; name: string }>;
  features: Array<{
    slug: string;
    name: string;
    description: unknown;
    isSubclassFeature: boolean;
  }>;
  spellcasting: Record<string, unknown> | null;
  newProficiencies: Array<{ slug: string; name: string }>;
  spellSelection: SpellSelectionForLevelUp | null;
}

export interface MissingPrerequisite {
  ability: string; // 'str' | 'dex' | ...
  required: number;
  current: number;
}

export interface SpellSelectionForLevelUp {
  casterType: CasterType;
  newCantrips: number;
  maxPrepared: number;
  currentPreparedSlugs: string[];
  newSpells: number;
  canSwapSpell: boolean;
  maxSpellLevel: number;
  currentCantrips: Array<{ slug: string; name: string }>;
  currentSpells: Array<{ slug: string; name: string; level: number }>;
  availableCantrips: Array<{ slug: string; name: string }>;
  availableSpells: Array<{ slug: string; name: string; level: number }>;
}

export interface LevelUpDto {
  classSlug: string;
  hpMethod: "roll" | "fixed";
  hpRoll?: number;
  subclassSlug?: string;
  abilityScoreIncreases?: Array<{ abilitySlug: string; increase: number }>;
  featSlug?: string;
  newSpells?: string[];
  removedSpells?: string[];
  preparedSpells?: string[];
  featureChoices?: Record<string, unknown>;
}

export interface LevelUpResult {
  totalLevel: number;
  classLevel: number;
  className: string;
  hpGained: number;
  newFeatures: string[];
  message: string;
  /**
   * Spec 005 — presente quando o LevelEntity da edição do PC não existia e o
   * service caiu no fallback via EditionRules.featureFallbackSource. Valor =
   * CompSourceEntity.code da fonte usada (ex: 'XPHB').
   */
  featureSourceFallback?: string;
}

@Injectable()
export class LevelUpService {
  private readonly logger = new Logger(LevelUpService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly charClassRepo: Repository<CharacterClassEntity>,
    @InjectRepository(CharacterAbilityScoreEntity)
    private readonly charAbilityRepo: Repository<CharacterAbilityScoreEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly stateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CharacterLevelUpEntity)
    private readonly levelUpRepo: Repository<CharacterLevelUpEntity>,
    @InjectRepository(CharacterFeatureEntity)
    private readonly charFeatureRepo: Repository<CharacterFeatureEntity>,
    @InjectRepository(CharacterSpellEntity)
    private readonly charSpellRepo: Repository<CharacterSpellEntity>,
    @InjectRepository(CharacterProficiencyEntity)
    private readonly charProfRepo: Repository<CharacterProficiencyEntity>,
    @InjectRepository(ClassEntity)
    private readonly classRepo: Repository<ClassEntity>,
    @InjectRepository(LevelEntity)
    private readonly levelRepo: Repository<LevelEntity>,
    @InjectRepository(SubclassEntity)
    private readonly subclassRepo: Repository<SubclassEntity>,
    @InjectRepository(SpellEntity)
    private readonly spellRepo: Repository<SpellEntity>,
    @InjectRepository(ProficiencyEntity)
    private readonly proficiencyRepo: Repository<ProficiencyEntity>,
    @InjectRepository(SpellClassEntity)
    private readonly spellClassRepo: Repository<SpellClassEntity>,
  ) {}

  // ---- GET /characters/:id/level-up-options ----

  async getOptions(
    userId: string,
    characterId: string,
  ): Promise<LevelUpOptionsResult> {
    const character = await this.ensureOwnership(userId, characterId);
    const state = await this.getState(characterId);
    const [charClasses, charAbilities, charSpells] = await Promise.all([
      this.charClassRepo.find({
        where: { character_id: characterId },
        order: { order: "ASC" },
      }),
      this.charAbilityRepo.find({ where: { character_id: characterId } }),
      this.charSpellRepo.find({ where: { character_id: characterId } }),
    ]);

    const totalLevel = charClasses.reduce((s, cc) => s + cc.class_level, 0);
    const xpRequired = totalLevel < 20 ? XP_THRESHOLDS[totalLevel] : Infinity;
    const canLevelUp = totalLevel < 20 && state.xp >= xpRequired;

    // Build ability score map
    const abilityMap = new Map<string, number>();
    for (const ca of charAbilities) {
      abilityMap.set(ca.ability_score.slug, ca.base_score + ca.bonus);
    }

    // Spec 005: group all ClassEntity rows by canonical slug, then pick one
    // representative per canonical (prefer the PC's own class when it matches;
    // else prefer a class from the PC's source; else fall back to canonical).
    const allClasses = await this.classRepo.find();
    const canonicalGroups = new Map<string, ClassEntity[]>();
    for (const cls of allClasses) {
      const canonical = normalizeClassSlug(cls.slug);
      const group = canonicalGroups.get(canonical) ?? [];
      group.push(cls);
      canonicalGroups.set(canonical, group);
    }

    const currentCanonicalMap = new Map<string, CharacterClassEntity>();
    for (const cc of charClasses) {
      currentCanonicalMap.set(normalizeClassSlug(cc.class.slug), cc);
    }

    const pickRepresentative = (group: ClassEntity[]): ClassEntity => {
      // 1. PC already has this class (any edition) → use the PC's ClassEntity
      const canonical = normalizeClassSlug(group[0].slug);
      const charClass = currentCanonicalMap.get(canonical);
      if (charClass) return charClass.class;
      // 2. Same source as the PC
      if (character.sourceId) {
        const same = group.find((c) => c.source_id === character.sourceId);
        if (same) return same;
      }
      // 3. Canonical (no suffix) preferred
      const canonicalEntity = group.find((c) => c.slug === canonical);
      if (canonicalEntity) return canonicalEntity;
      // 4. First row
      return group[0];
    };

    const availableClasses: AvailableClassOption[] = [];
    const hitDie: Record<string, number> = {};

    for (const [canonical, group] of canonicalGroups) {
      const cls = pickRepresentative(group);
      const charClass = currentCanonicalMap.get(canonical);
      const isCurrentClass = !!charClass;
      const isMulticlass = !isCurrentClass;
      const nextClassLevel = isCurrentClass ? charClass.class_level + 1 : 1;

      // Canonical-first: classe s\u00f3 aparece pra multiclasse se estiver liberada.
      // Classe atual do PC continua aparecendo pra ele poder subir de n\u00edvel.
      if (!isCurrentClass && !isClassAvailable(cls.slug)) continue;

      // Parse multiclassing prerequisites + compute missing
      const prereqs = this.parsePrerequisites(cls.multi_classing);
      const missingPrerequisites = isCurrentClass
        ? []
        : this.computeMissingPrerequisites(prereqs, abilityMap);
      const meetsPrereqs = missingPrerequisites.length === 0;

      // For multiclass: also need to meet current class prereqs (RAW)
      if (!isCurrentClass && meetsPrereqs) {
        const currentPrimaryClass = charClasses[0]?.class;
        if (currentPrimaryClass) {
          const currentPrereqs = this.parsePrerequisites(
            currentPrimaryClass.multi_classing,
          );
          const currentMissing = this.computeMissingPrerequisites(
            currentPrereqs,
            abilityMap,
          );
          if (currentMissing.length > 0) continue;
        }
      }

      // Spec 005 — load level data with PHB→XPHB fallback when seeded gaps exist
      const { levelData, fallbackSource } = await this.resolveLevelData(
        cls,
        nextClassLevel,
        character.source?.rules,
        null,
      );

      // Also load subclass level data if character has a subclass for this class
      let subclassFeatures: Array<{
        slug: string;
        name: string;
        description: unknown;
        isSubclassFeature: boolean;
      }> = [];

      if (charClass?.subclass_id) {
        const { levelData: subLevelData } = await this.resolveLevelData(
          cls,
          nextClassLevel,
          character.source?.rules,
          charClass.subclass_id,
        );
        if (subLevelData?.level_features) {
          subclassFeatures = subLevelData.level_features.map((lf) => ({
            slug: lf.feature.slug,
            name: lf.feature.name,
            description: lf.feature.description,
            isSubclassFeature: true,
          }));
        }
      }

      const hasAsi = (levelData?.ability_score_bonuses ?? 0) > 0;

      // Check if this level requires subclass choice (edition-aware)
      const editionRules = character.source?.rules;
      const hasSubclass =
        this.isSubclassLevel(cls.slug, nextClassLevel, editionRules) &&
        !charClass?.subclass_id;

      // Available subclasses
      let availableSubclasses: Array<{ slug: string; name: string }> = [];
      if (hasSubclass) {
        const subs = await this.subclassRepo.find({
          where: { class_id: cls.id },
        });
        // Canonical-first: filtra pela allowlist da classe.
        const allowed = new Set(getCanonicalSubclassSlugs(cls.slug));
        availableSubclasses = subs
          .filter((s) => allowed.has(s.slug))
          .map((s) => ({ slug: s.slug, name: s.name }));
      }

      // Features
      const features = (levelData?.level_features ?? []).map((lf) => ({
        slug: lf.feature.slug,
        name: lf.feature.name,
        description: lf.feature.description,
        isSubclassFeature: false,
      }));

      // New proficiencies from multiclassing
      let newProficiencies: Array<{ slug: string; name: string }> = [];
      if (!isCurrentClass && nextClassLevel === 1) {
        newProficiencies = this.getMulticlassProficiencies(cls.multi_classing);
      }

      // Spellcasting for this level
      const spellcasting = levelData?.spellcasting ?? null;

      // Spell selection context for level-up
      const spellSelection = await this.buildSpellSelection(
        cls,
        nextClassLevel,
        isCurrentClass ? charClass.class_level : 0,
        charSpells,
        charAbilities,
        character.source?.rules,
      );

      hitDie[canonical] = cls.hit_die;

      availableClasses.push({
        slug: canonical,
        sourceQualifiedSlug: cls.slug,
        ...(fallbackSource ? { featureSourceFallback: fallbackSource } : {}),
        name: cls.name,
        isCurrentClass,
        isMulticlass,
        hitDie: cls.hit_die,
        meetsPrerequisites: meetsPrereqs,
        prerequisites: prereqs,
        missingPrerequisites,
        nextLevel: nextClassLevel,
        hasAsi,
        hasSubclass,
        availableSubclasses,
        features: [...features, ...subclassFeatures],
        spellcasting,
        newProficiencies,
        spellSelection,
      });
    }

    return {
      currentLevel: totalLevel,
      newLevel: totalLevel + 1,
      xp: state.xp,
      xpRequired,
      canLevelUp,
      availableClasses,
      hitDie,
    };
  }

  // ---- POST /characters/:id/level-up ----

  async execute(
    userId: string,
    characterId: string,
    dto: LevelUpDto,
  ): Promise<LevelUpResult> {
    await this.ensureOwnership(userId, characterId);
    const state = await this.getState(characterId);
    const charClasses = await this.charClassRepo.find({
      where: { character_id: characterId },
      order: { order: "ASC" },
    });
    const charAbilities = await this.charAbilityRepo.find({
      where: { character_id: characterId },
    });

    const totalLevel = charClasses.reduce((s, cc) => s + cc.class_level, 0);

    // Validate: level cap
    if (totalLevel >= 20) {
      throw new BadRequestException("Personagem ja esta no nivel maximo (20).");
    }

    // Validate: XP
    const xpRequired = XP_THRESHOLDS[totalLevel];
    if (state.xp < xpRequired) {
      throw new BadRequestException(
        `XP insuficiente. Necessario: ${xpRequired}, atual: ${state.xp}.`,
      );
    }

    // Spec 005: Resolve class by canonical slug (normalizes -phb/-xphb suffixes
    // and case). PC `fighter-phb` + input `fighter` must advance, not multiclass.
    const inputCanonical = normalizeClassSlug(dto.classSlug.toLowerCase());
    const existingCharClass = charClasses.find(
      (cc) => normalizeClassSlug(cc.class.slug) === inputCanonical,
    );

    // When advancing, preserve the PC's ClassEntity (source-qualified). When
    // multiclassing, look up the ClassEntity by input or canonical slug.
    let classEntity: ClassEntity | null = null;
    if (existingCharClass) {
      classEntity = existingCharClass.class;
    } else {
      classEntity =
        (await this.classRepo.findOneBy({
          slug: dto.classSlug.toLowerCase(),
        })) ?? (await this.classRepo.findOneBy({ slug: inputCanonical }));
    }
    if (!classEntity) {
      throw new BadRequestException(
        `Classe '${dto.classSlug}' nao encontrada.`,
      );
    }

    const isNewClass = !existingCharClass;
    const newClassLevel = isNewClass ? 1 : existingCharClass.class_level + 1;
    const newTotalLevel = totalLevel + 1;

    // Spec 005 — Wizard advance (level > 1) demands exactly 2 new spellbook
    // entries per RAW. Applied only when advancing an existing Wizard level,
    // not when multiclassing into Wizard at L1 (creation flow handles that).
    if (inputCanonical === "wizard" && !isNewClass && newClassLevel > 1) {
      this.validateWizardSpellSelection(dto.newSpells);
      await this.validateWizardSpellsDeep(
        dto.newSpells!,
        classEntity,
        newClassLevel,
        characterId,
      );
    }

    // Spec 005: multiclass prereqs — 403 with structured missingPrerequisites.
    if (isNewClass) {
      const abilityMap = new Map<string, number>();
      for (const ca of charAbilities) {
        abilityMap.set(ca.ability_score.slug, ca.base_score + ca.bonus);
      }

      const newPrereqs = this.parsePrerequisites(classEntity.multi_classing);
      const missingNew = this.computeMissingPrerequisites(
        newPrereqs,
        abilityMap,
      );
      if (missingNew.length > 0) {
        throw new ForbiddenException({
          code: "MULTICLASS_PREREQ_NOT_MET",
          error: `Pre-requisitos de multiclasse para ${classEntity.name} nao atendidos.`,
          missingPrerequisites: missingNew,
        });
      }

      const primaryClass = charClasses[0]?.class;
      if (primaryClass) {
        const currentPrereqs = this.parsePrerequisites(
          primaryClass.multi_classing,
        );
        const missingCurrent = this.computeMissingPrerequisites(
          currentPrereqs,
          abilityMap,
        );
        if (missingCurrent.length > 0) {
          throw new ForbiddenException({
            code: "MULTICLASS_PREREQ_NOT_MET",
            error: `Pre-requisitos de multiclasse da classe atual (${primaryClass.name}) nao atendidos.`,
            missingPrerequisites: missingCurrent,
          });
        }
      }
    }

    // Build ability score map for CON mod calculation
    const abilityMap = new Map<string, number>();
    for (const ca of charAbilities) {
      abilityMap.set(ca.ability_score.slug, ca.base_score + ca.bonus);
    }
    const conMod = getAbilityModifier(abilityMap.get("con") ?? 10);

    // Calculate HP gained
    let hpGained: number;
    if (dto.hpMethod === "roll") {
      if (dto.hpRoll === undefined || dto.hpRoll === null) {
        throw new BadRequestException("Valor da rolagem de HP e obrigatorio.");
      }
      if (dto.hpRoll < 1 || dto.hpRoll > classEntity.hit_die) {
        throw new BadRequestException(
          `Rolagem de HP invalida. Deve ser entre 1 e ${classEntity.hit_die}.`,
        );
      }
      hpGained = dto.hpRoll + conMod;
    } else {
      // Fixed: hit_die/2 + 1 + CON mod
      hpGained = Math.floor(classEntity.hit_die / 2) + 1 + conMod;
    }
    // Minimum 1 HP
    hpGained = Math.max(1, hpGained);

    // Execute in transaction
    return this.dataSource.transaction(async (manager) => {
      const newFeatures: string[] = [];

      // 1. Update or create CharacterClass
      if (isNewClass) {
        const newOrder = charClasses.length + 1;
        await manager.save(CharacterClassEntity, {
          character_id: characterId,
          class_id: classEntity.id,
          class_level: 1,
          order: newOrder,
          subclass_id: dto.subclassSlug
            ? (await this.subclassRepo.findOneBy({ slug: dto.subclassSlug }))
                ?.id
            : undefined,
        });
      } else {
        existingCharClass.class_level = newClassLevel;
        if (dto.subclassSlug && !existingCharClass.subclass_id) {
          const subclass = await this.subclassRepo.findOneBy({
            slug: dto.subclassSlug,
          });
          if (subclass) {
            existingCharClass.subclass_id = subclass.id;
            // TypeORM save() usa relation eager como source of truth — se só
            // setamos subclass_id e a relation `subclass` fica undefined, o
            // save zera o FK. Setar ambos mantém consistência.
            existingCharClass.subclass = subclass;
          }
        }
        await manager.save(CharacterClassEntity, existingCharClass);
      }

      // 2. Create LevelUp record
      await manager.save(CharacterLevelUpEntity, {
        character_id: characterId,
        total_level: newTotalLevel,
        class_id: classEntity.id,
        hp_gained: hpGained,
        hp_method:
          dto.hpMethod === "roll" ? HpMethodEnum.Roll : HpMethodEnum.Fixed,
        choices: {
          classSlug: dto.classSlug,
          subclassSlug: dto.subclassSlug,
          abilityScoreIncreases: dto.abilityScoreIncreases,
          featSlug: dto.featSlug,
          newSpells: dto.newSpells,
          removedSpells: dto.removedSpells,
          featureChoices: dto.featureChoices,
        },
      });

      // 3. Update HP in state
      state.current_hp += hpGained;
      await manager.save(CharacterStateEntity, state);

      // Spec 005 — load features with PHB→XPHB fallback (tracks source used)
      const character = await this.ensureOwnership(userId, characterId);
      const { levelData, fallbackSource } = await this.resolveLevelData(
        classEntity,
        newClassLevel,
        character.source?.rules,
        null,
      );

      if (levelData?.level_features) {
        for (const lf of levelData.level_features) {
          await manager.save(CharacterFeatureEntity, {
            character_id: characterId,
            feature_id: lf.feature.id,
            source_class_id: classEntity.id,
            active: true,
            choices: dto.featureChoices?.[lf.feature.slug] ?? {},
          });
          newFeatures.push(lf.feature.name);
        }
      }

      // Also add subclass features
      const charClass = isNewClass
        ? await manager.findOne(CharacterClassEntity, {
            where: { character_id: characterId, class_id: classEntity.id },
          })
        : existingCharClass;

      if (charClass?.subclass_id) {
        // Spec 012 fix cross-class: quando subclass é escolhida em L3 (ex: Cleric
        // Life escolhe em L3 mas features existem em L1/L2 da subclass), features
        // dos níveis anteriores NÃO aplicam naquele level-up sem processamento
        // retroativo. Cleric Life L1 Disciple, Cleric Life L2 Preserve Life,
        // Paladin Oath L3 spells always-prep, Druid Circle L3, etc.
        //
        // Fix: quando `dto.subclassSlug` veio no payload DESTE level-up (ou seja,
        // char ganhou subclass agora), processa features L1..(newClassLevel-1)
        // da subclass também. Só adiciona as que ainda não existem em character_features.
        const subclassJustPicked = Boolean(dto.subclassSlug);
        const levelsToProcess: number[] = subclassJustPicked
          ? Array.from({ length: newClassLevel }, (_, i) => i + 1) // 1..newClassLevel
          : [newClassLevel];

        for (const lv of levelsToProcess) {
          const { levelData: subLevelData } = await this.resolveLevelData(
            classEntity,
            lv,
            character.source?.rules,
            charClass.subclass_id,
          );
          if (!subLevelData?.level_features) continue;
          for (const lf of subLevelData.level_features) {
            // Evita duplicatas quando processando retroativamente
            const existing = await manager.findOne(CharacterFeatureEntity, {
              where: {
                character_id: characterId,
                feature_id: lf.feature.id,
              },
            });
            if (existing) continue;
            await manager.save(CharacterFeatureEntity, {
              character_id: characterId,
              feature_id: lf.feature.id,
              source_class_id: classEntity.id,
              active: true,
              choices: dto.featureChoices?.[lf.feature.slug] ?? {},
            });
            newFeatures.push(lf.feature.name);
          }
        }
      }

      // 5. Handle ASI / Feat
      if (dto.abilityScoreIncreases?.length) {
        let totalIncrease = 0;
        for (const asi of dto.abilityScoreIncreases) {
          totalIncrease += asi.increase;
          const abilityRecord = charAbilities.find(
            (ca) => ca.ability_score.slug === asi.abilitySlug,
          );
          if (abilityRecord) {
            abilityRecord.bonus += asi.increase;
            // Epic Boons (level 19+) allow scores up to 30; normal ASIs cap at 20
            const isEpicBoon = dto.featSlug && totalLevel >= 19;
            const cap = isEpicBoon ? 30 : 20;
            const totalScore = abilityRecord.base_score + abilityRecord.bonus;
            if (totalScore > cap) {
              abilityRecord.bonus = cap - abilityRecord.base_score;
            }
            await manager.save(CharacterAbilityScoreEntity, abilityRecord);
          }
        }

        // If CON changed, retroactive HP adjustment
        if (dto.abilityScoreIncreases.some((a) => a.abilitySlug === "con")) {
          const newConScore = abilityMap.get("con") ?? 10;
          const conAsi = dto.abilityScoreIncreases.find(
            (a) => a.abilitySlug === "con",
          );
          if (conAsi) {
            const newConMod = Math.floor(
              (newConScore + conAsi.increase - 10) / 2,
            );
            const oldConMod = conMod;
            const conModDiff = newConMod - oldConMod;
            if (conModDiff > 0) {
              // Retroactive: add conModDiff * totalLevel HP
              const retroHp = conModDiff * newTotalLevel;
              state.current_hp += retroHp;
              await manager.save(CharacterStateEntity, state);
            }
          }
        }
      }

      // 6. New spells
      if (dto.newSpells?.length) {
        const casterType = getCasterClassType(classEntity.slug);
        for (const spellSlug of dto.newSpells) {
          const spell = await this.spellRepo.findOneBy({ slug: spellSlug });
          if (!spell) continue;
          // Check if already exists
          const existing = await manager.findOne(CharacterSpellEntity, {
            where: { character_id: characterId, spell_id: spell.id },
          });
          if (existing) continue;

          let status: SpellStatusEnum;
          if (spell.level === 0) {
            status = SpellStatusEnum.Known;
          } else if (casterType === "spellbook") {
            status = SpellStatusEnum.Spellbook;
          } else if (casterType === "known" || casterType === "pact") {
            status = SpellStatusEnum.Known;
          } else {
            status = SpellStatusEnum.Prepared;
          }

          await manager.save(CharacterSpellEntity, {
            character_id: characterId,
            spell_id: spell.id,
            source: SpellSourceEnum.Class,
            status,
            always_prepared: spell.level === 0,
          });
        }
      }

      // 7. Removed spells (for known-spell casters swapping)
      if (dto.removedSpells?.length) {
        for (const spellSlug of dto.removedSpells) {
          const spell = await this.spellRepo.findOneBy({ slug: spellSlug });
          if (!spell) continue;
          await manager.delete(CharacterSpellEntity, {
            character_id: characterId,
            spell_id: spell.id,
          });
        }
      }

      // 7b. Prepared spells selection (spellbook / total_access casters)
      if (dto.preparedSpells) {
        const casterType = getCasterClassType(classEntity.slug);
        if (casterType === "spellbook" || casterType === "total_access") {
          const preparedSet = new Set(dto.preparedSpells);

          // Get all current class spells (level > 0) for this character
          const allCharSpells = await manager.find(CharacterSpellEntity, {
            where: { character_id: characterId, source: SpellSourceEnum.Class },
            relations: ["spell"],
          });

          // Group by slug to handle duplicates
          const bySlug = new Map<string, CharacterSpellEntity[]>();
          for (const cs of allCharSpells) {
            if (cs.spell.level === 0 || cs.always_prepared) continue;
            const existing = bySlug.get(cs.spell.slug) ?? [];
            existing.push(cs);
            bySlug.set(cs.spell.slug, existing);
          }

          for (const [slug, records] of bySlug) {
            // Keep only 1 record, delete extras
            const keep = records[0];
            for (let i = 1; i < records.length; i++) {
              await manager.remove(CharacterSpellEntity, records[i]);
            }

            const shouldPrepare = preparedSet.has(slug);
            if (shouldPrepare) {
              if (keep.status !== SpellStatusEnum.Prepared) {
                keep.status = SpellStatusEnum.Prepared;
                await manager.save(CharacterSpellEntity, keep);
              }
            } else {
              if (casterType === "spellbook") {
                if (keep.status === SpellStatusEnum.Prepared) {
                  keep.status = SpellStatusEnum.Spellbook;
                  await manager.save(CharacterSpellEntity, keep);
                }
              } else {
                if (keep.status === SpellStatusEnum.Prepared) {
                  await manager.remove(CharacterSpellEntity, keep);
                }
              }
            }
          }

          // For total_access: add newly prepared spells that don't exist yet
          if (casterType === "total_access") {
            const existingSlugs = new Set(bySlug.keys());
            for (const slug of dto.preparedSpells) {
              if (existingSlugs.has(slug)) continue;
              const spell = await this.spellRepo.findOneBy({ slug });
              if (!spell || spell.level === 0) continue;
              await manager.save(CharacterSpellEntity, {
                character_id: characterId,
                spell_id: spell.id,
                source: SpellSourceEnum.Class,
                status: SpellStatusEnum.Prepared,
                always_prepared: false,
              });
            }
          }
        }
      }

      // 8. Multiclass proficiencies
      if (isNewClass) {
        const multiProfs = this.getMulticlassProficiencies(
          classEntity.multi_classing,
        );
        for (const mp of multiProfs) {
          const profEntity = await this.proficiencyRepo.findOneBy({
            slug: mp.slug,
          });
          if (!profEntity) continue;
          const existing = await manager.findOne(CharacterProficiencyEntity, {
            where: { character_id: characterId, proficiency_id: profEntity.id },
          });
          if (existing) continue;
          await manager.save(CharacterProficiencyEntity, {
            character_id: characterId,
            proficiency_id: profEntity.id,
            source: CharacterProficiencySourceEnum.Multiclass,
          });
        }
      }

      return {
        totalLevel: newTotalLevel,
        classLevel: newClassLevel,
        className: classEntity.name,
        hpGained,
        newFeatures,
        message: `${classEntity.name} nivel ${newClassLevel}! (Nivel total: ${newTotalLevel})`,
        ...(fallbackSource ? { featureSourceFallback: fallbackSource } : {}),
      };
    });
  }

  // ---- Helpers ----

  /**
   * Build spell selection context for a class at level-up.
   * Returns null if the class is not a spellcaster.
   */
  private async buildSpellSelection(
    cls: ClassEntity,
    newClassLevel: number,
    currentClassLevel: number,
    charSpells: CharacterSpellEntity[],
    charAbilities: CharacterAbilityScoreEntity[],
    editionRules?: EditionRules,
  ): Promise<SpellSelectionForLevelUp | null> {
    const casterType = getCasterClassType(cls.slug);
    if (!casterType) return null;

    // Load spellcasting data for new and current levels
    const [newLevelData, prevLevelData] = await Promise.all([
      this.levelRepo.findOne({
        where: {
          class_id: cls.id,
          level: newClassLevel,
          subclass_id: IsNull(),
        },
      }),
      currentClassLevel > 0
        ? this.levelRepo.findOne({
            where: {
              class_id: cls.id,
              level: currentClassLevel,
              subclass_id: IsNull(),
            },
          })
        : Promise.resolve(null),
    ]);

    const newSc = (newLevelData?.spellcasting ?? {}) as Record<string, number>;
    const prevSc = (prevLevelData?.spellcasting ?? {}) as Record<
      string,
      number
    >;

    // Calculate cantrip delta
    const newCantrips = Math.max(
      0,
      (newSc["cantrips_known"] ?? 0) - (prevSc["cantrips_known"] ?? 0),
    );

    // Calculate max spell level from slot data
    let maxSpellLevel = 0;
    for (let i = 1; i <= 9; i++) {
      if ((newSc[`spell_slots_level_${i}`] ?? 0) > 0) {
        maxSpellLevel = i;
      }
    }

    // Known-spell casters: calculate new spells count from spells_known delta
    // total_access/spellbook: prepared from list, no fixed new-spells count at level-up
    // (wizard gets 2 free spells per level in spellbook)
    let newSpells = 0;
    let canSwapSpell = false;

    if (casterType === "known" || casterType === "pact") {
      newSpells = Math.max(
        0,
        (newSc["spells_known"] ?? 0) - (prevSc["spells_known"] ?? 0),
      );
      canSwapSpell = currentClassLevel > 0; // can swap 1 spell at level-up (not at level 1)
    } else if (casterType === "spellbook") {
      newSpells = 2; // wizard adds 2 spells to spellbook per level
    }

    // Character's current cantrips and spells for this class (deduplicated)
    const seenCantrips = new Set<string>();
    const currentCantrips = charSpells
      .filter(
        (cs) => cs.source === SpellSourceEnum.Class && cs.spell.level === 0,
      )
      .filter((cs) => {
        if (seenCantrips.has(cs.spell.slug)) return false;
        seenCantrips.add(cs.spell.slug);
        return true;
      })
      .map((cs) => ({ slug: cs.spell.slug, name: cs.spell.name }));

    const seenSpells = new Set<string>();
    const currentSpells = charSpells
      .filter((cs) => cs.source === SpellSourceEnum.Class && cs.spell.level > 0)
      .filter((cs) => {
        if (seenSpells.has(cs.spell.slug)) return false;
        seenSpells.add(cs.spell.slug);
        return true;
      })
      .map((cs) => ({
        slug: cs.spell.slug,
        name: cs.spell.name,
        level: cs.spell.level,
      }));

    // Available spells from the class spell list
    const classSpellLinks = await this.spellClassRepo.find({
      where: { class_id: cls.id },
      relations: ["spell"],
    });

    const currentSpellSlugs = new Set(charSpells.map((cs) => cs.spell.slug));

    const availableCantrips = classSpellLinks
      .filter(
        (sc) => sc.spell.level === 0 && !currentSpellSlugs.has(sc.spell.slug),
      )
      .map((sc) => ({ slug: sc.spell.slug, name: sc.spell.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const availableSpells = classSpellLinks
      .filter(
        (sc) =>
          sc.spell.level > 0 &&
          sc.spell.level <= maxSpellLevel &&
          !currentSpellSlugs.has(sc.spell.slug),
      )
      .map((sc) => ({
        slug: sc.spell.slug,
        name: sc.spell.name,
        level: sc.spell.level,
      }))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

    // Compute max prepared spells and current prepared slugs (deduplicated)
    const maxPrepared = this.computeMaxPrepared(
      cls.slug,
      newClassLevel,
      charAbilities,
      editionRules,
    );
    const preparedSet = new Set<string>();
    charSpells
      .filter(
        (cs) =>
          cs.source === SpellSourceEnum.Class &&
          cs.spell.level > 0 &&
          (cs.status === SpellStatusEnum.Prepared || cs.always_prepared),
      )
      .forEach((cs) => preparedSet.add(cs.spell.slug));
    const currentPreparedSlugs = [...preparedSet];

    return {
      casterType,
      newCantrips,
      newSpells,
      canSwapSpell,
      maxSpellLevel,
      maxPrepared,
      currentPreparedSlugs,
      currentCantrips,
      currentSpells,
      availableCantrips,
      availableSpells,
    };
  }

  private computeMaxPrepared(
    classSlug: string,
    classLevel: number,
    charAbilities: CharacterAbilityScoreEntity[],
    editionRules?: EditionRules,
  ): number {
    const casterType = getCasterClassType(classSlug);
    const scAbility = getSpellcastingAbility(classSlug);
    if (!casterType || !scAbility) return 0;

    const abilityScore = charAbilities.find(
      (ca) => ca.ability_score.slug === scAbility,
    );
    const totalScore = abilityScore
      ? abilityScore.base_score + abilityScore.bonus
      : 10;
    const abilityMod = getAbilityModifier(totalScore);

    switch (casterType) {
      case "total_access": {
        // Check edition-specific prepared formula
        const formula = getPreparedFormula(
          normalizeClassSlug(classSlug),
          editionRules,
        );
        if (formula === "halfLevel+mod") {
          return Math.max(1, Math.floor(classLevel / 2) + abilityMod);
        }
        // Default (2024 or no override): level + mod
        return Math.max(1, classLevel + abilityMod);
      }
      case "spellbook":
        return Math.max(1, classLevel + abilityMod);
      case "known":
      case "pact":
        return Infinity;
      default:
        return 0;
    }
  }

  private async ensureOwnership(
    userId: string,
    characterId: string,
  ): Promise<CharacterEntity> {
    // Spec 005: load source to resolve EditionRules (subclass level,
    // prepared formula, feature fallback) per the character's edition.
    return ensureCharacterOwnership(this.characterRepo, userId, characterId, [
      "source",
    ]);
  }

  /**
   * Spec 005 — Resolve LevelEntity for (classEntity, nextLevel). When the
   * native row is missing and the rules declare a `featureFallbackSource`,
   * look up the same canonical class in that source and return it, tagged
   * with the fallback source code. Emits a warning log so seed gaps are
   * visible in production.
   */
  private async resolveLevelData(
    classEntity: ClassEntity,
    nextLevel: number,
    rules: EditionRules | undefined,
    subclassId: string | null,
  ): Promise<{
    levelData: LevelEntity | null;
    fallbackSource?: string;
  }> {
    const whereClause = subclassId
      ? { class_id: classEntity.id, level: nextLevel, subclass_id: subclassId }
      : { class_id: classEntity.id, level: nextLevel, subclass_id: IsNull() };
    // DB pode ter múltiplas rows de `levels` para a mesma tupla (class_id, level,
    // subclass_id) quando features vem de seed-sources distintos (SRD legacy +
    // XPHB oficial). findOne perderia features da 2ª+ row. find + union garante
    // que todas level_features daquele level sejam atribuídas ao char.
    const nativeRows = await this.levelRepo.find({
      where: whereClause,
      relations: ["level_features", "level_features.feature"],
    });
    if (nativeRows.length > 0) {
      const seen = new Set<string>();
      const merged = [] as NonNullable<LevelEntity["level_features"]>;
      for (const row of nativeRows) {
        for (const lf of row.level_features ?? []) {
          if (lf.feature?.id && !seen.has(lf.feature.id)) {
            seen.add(lf.feature.id);
            merged.push(lf);
          }
        }
      }
      if (merged.length > 0) {
        const aggregated: LevelEntity = {
          ...nativeRows[0],
          level_features: merged,
        };
        return { levelData: aggregated };
      }
    }

    // Native missing or feature-less — try fallback source if configured
    const fallbackCode = rules?.featureFallbackSource;
    if (!fallbackCode || subclassId) {
      // Don't fall back subclass data — subclasses are edition-specific by design
      return { levelData: null };
    }

    const canonical = normalizeClassSlug(classEntity.slug);
    const fallbackClass = await this.classRepo.findOne({
      where: { slug: canonical },
      relations: ["source"],
    });
    if (!fallbackClass || fallbackClass.source?.code !== fallbackCode) {
      return { levelData: null };
    }

    const fallbackData = await this.levelRepo.findOne({
      where: {
        class_id: fallbackClass.id,
        level: nextLevel,
        subclass_id: IsNull(),
      },
      relations: ["level_features", "level_features.feature"],
    });
    if (fallbackData) {
      this.logger.warn(
        `[LEVEL_UP_FALLBACK] class=${classEntity.slug} level=${nextLevel} fallback=${fallbackCode}`,
      );
      return { levelData: fallbackData, fallbackSource: fallbackCode };
    }
    return { levelData: null };
  }

  private async getState(characterId: string): Promise<CharacterStateEntity> {
    return getCharacterState(this.stateRepo, characterId);
  }

  private parsePrerequisites(
    multiClassing: Record<string, unknown>,
  ): MulticlassPrereq[] {
    const prereqs: MulticlassPrereq[] = [];
    const raw = multiClassing?.prerequisites as
      | Array<{ ability_score?: { index?: string }; minimum_score?: number }>
      | undefined;
    if (!raw) return prereqs;
    for (const p of raw) {
      if (p.ability_score?.index && p.minimum_score) {
        prereqs.push({
          abilityScoreSlug: p.ability_score.index,
          minimumScore: p.minimum_score,
        });
      }
    }
    return prereqs;
  }

  private checkPrerequisites(
    prereqs: MulticlassPrereq[],
    abilityMap: Map<string, number>,
    _charClasses: CharacterClassEntity[],
  ): boolean {
    for (const p of prereqs) {
      const score = abilityMap.get(p.abilityScoreSlug) ?? 0;
      if (score < p.minimumScore) return false;
    }
    return true;
  }

  /**
   * Spec 005 — Wizard add-to-spellbook validation.
   *
   * Per RAW, a Wizard adds exactly 2 spells to the spellbook per level gained.
   * The service enforces:
   *   - newSpells must be present
   *   - exactly 2 entries
   *   - no duplicates in the selection
   *
   * Uniqueness against existing spellbook + class-list + maxSpellLevel checks
   * happen downstream in spell materialization (where the SpellEntity is
   * loaded). This keeps the synchronous pre-validation simple and fast.
   */
  private validateWizardSpellSelection(newSpells: string[] | undefined): void {
    const spells = newSpells ?? [];
    if (spells.length === 0) {
      throw new BadRequestException({
        code: "WIZARD_SPELLS_REQUIRED",
        error:
          "Wizard ganha 2 spells ao subir de nivel; selecione exatamente 2.",
        requiredCount: 2,
      });
    }
    if (spells.length > 2) {
      throw new BadRequestException({
        code: "WIZARD_SPELLS_LIMIT_EXCEEDED",
        error: `Wizard pode adicionar no maximo 2 spells por level-up. Recebido: ${spells.length}.`,
        allowed: 2,
        received: spells.length,
      });
    }
    if (spells.length < 2) {
      throw new BadRequestException({
        code: "WIZARD_SPELLS_REQUIRED",
        error: `Wizard precisa selecionar 2 spells, recebido ${spells.length}.`,
        requiredCount: 2,
      });
    }
    const seen = new Set<string>();
    for (const slug of spells) {
      if (seen.has(slug)) {
        throw new BadRequestException({
          code: "WIZARD_SPELL_INVALID",
          error: `Spell '${slug}' selecionada mais de uma vez.`,
          slug,
          reason: "duplicate_in_selection",
        });
      }
      seen.add(slug);
    }
  }

  /**
   * Spec 005 — Wizard spell deep validation (post classEntity resolution).
   *
   * For each slug: exists in DB, is in the Wizard class list, is at or below
   * the Wizard's new-level maxSpellLevel, and is not already in the spellbook.
   * Throws a structured BadRequestException with a specific reason on the
   * first offending slug (fail fast; the front re-calls after user fixes it).
   */
  private async validateWizardSpellsDeep(
    slugs: string[],
    wizardClass: ClassEntity,
    newClassLevel: number,
    characterId: string,
  ): Promise<void> {
    // maxSpellLevel derived from the Wizard's new caster level
    const slots = FULL_CASTER_SLOTS[newClassLevel] ?? [];
    const maxSpellLevel = slots.length;

    // Load existing spellbook slugs for duplicate check
    const existing = await this.charSpellRepo.find({
      where: { character_id: characterId },
      relations: ["spell"],
    });
    const existingSlugs = new Set(existing.map((cs) => cs.spell.slug));

    // Load Wizard class spell list
    const classLinks = await this.spellClassRepo.find({
      where: { class_id: wizardClass.id },
      relations: ["spell"],
    });
    const classSpellSlugs = new Set(classLinks.map((sc) => sc.spell.slug));

    for (const slug of slugs) {
      const spell = await this.spellRepo.findOneBy({ slug });
      if (!spell) {
        throw new BadRequestException({
          code: "WIZARD_SPELL_INVALID",
          error: `Spell '${slug}' nao encontrada.`,
          slug,
          reason: "not_found",
        });
      }
      if (!classSpellSlugs.has(slug)) {
        throw new BadRequestException({
          code: "WIZARD_SPELL_INVALID",
          error: `Spell '${slug}' nao faz parte da lista Wizard.`,
          slug,
          reason: "not_in_class_list",
        });
      }
      if (spell.level > maxSpellLevel) {
        throw new BadRequestException({
          code: "WIZARD_SPELL_INVALID",
          error: `Spell '${slug}' (nivel ${spell.level}) excede o maximo permitido no Wizard L${newClassLevel} (nivel ${maxSpellLevel}).`,
          slug,
          reason: "above_max_spell_level",
        });
      }
      if (existingSlugs.has(slug)) {
        throw new BadRequestException({
          code: "WIZARD_SPELL_ALREADY_KNOWN",
          error: `Spell '${slug}' ja esta no spellbook.`,
          slug,
        });
      }
    }
  }

  /** Spec 005: structured list of missing prereqs (empty when all met). */
  private computeMissingPrerequisites(
    prereqs: MulticlassPrereq[],
    abilityMap: Map<string, number>,
  ): MissingPrerequisite[] {
    const missing: MissingPrerequisite[] = [];
    for (const p of prereqs) {
      const current = abilityMap.get(p.abilityScoreSlug) ?? 0;
      if (current < p.minimumScore) {
        missing.push({
          ability: p.abilityScoreSlug,
          required: p.minimumScore,
          current,
        });
      }
    }
    return missing;
  }

  private getMulticlassProficiencies(
    multiClassing: Record<string, unknown>,
  ): Array<{ slug: string; name: string }> {
    const profs = multiClassing?.proficiencies as
      | Array<{ index?: string; name?: string }>
      | undefined;
    if (!profs) return [];
    return profs
      .filter((p) => p.index && p.name)
      .map((p) => ({ slug: p.index!, name: p.name! }));
  }

  /** Subclass selection level — edition-aware via EditionRules capabilities */
  private isSubclassLevel(
    classSlug: string,
    level: number,
    editionRules?: EditionRules,
  ): boolean {
    const normalized = classSlug.replace(/-phb$/, "");
    const subclassLevel = getSubclassLevelFromRules(normalized, editionRules);
    // If class chooses subclass at level 1, it's done at creation, so skip
    return subclassLevel > 1 && level === subclassLevel;
  }
}
