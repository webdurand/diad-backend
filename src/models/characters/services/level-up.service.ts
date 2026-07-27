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
  CampaignPartyMemberEntity,
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
  WARLOCK_SLOTS,
  getCasterClassType,
  getCasterSlotType,
  getSpellcastingAbility,
  getStandardCasterLevelContribution,
  normalizeClassSlug,
} from "src/shared/srd-constants";
import { getAbilityModifier } from "src/shared/srd-utils";
import {
  ensureCharacterReadAccess,
  ensureCharacterWriteAccess,
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
import {
  isElementalFuryFeatureSlug,
  normalizeElementalFuryChoice,
  type ElementalFuryChoice,
} from "src/shared/druid-rules";

type CasterType = CasterClassType;

interface MulticlassPrereq {
  abilityScoreSlug: string;
  minimumScore: number;
}

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
  slug: string;
  sourceQualifiedSlug: string;
  featureSourceFallback?: string;
  name: string;
  isCurrentClass: boolean;
  isMulticlass: boolean;
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
    choice?: {
      key: string;
      required: boolean;
      options: Array<{
        value: string;
        label: string;
        description: string;
      }>;
    };
  }>;
  spellcasting: Record<string, unknown> | null;
  newProficiencies: Array<{ slug: string; name: string }>;
  spellSelection: SpellSelectionForLevelUp | null;
}

type FeatureChoiceDescriptor = NonNullable<
  AvailableClassOption["features"][number]["choice"]
>;

const RANGER_HUNTER_FEATURE_CHOICES: Array<{
  matches: (normalizedSlug: string) => boolean;
  descriptor: FeatureChoiceDescriptor;
}> = [
  {
    matches: (slug) => slug.startsWith("hunters-prey-ranger-hunter-"),
    descriptor: {
      key: "option",
      required: true,
      options: [
        {
          value: "hunters-prey-colossus-slayer",
          label: "Colossus Slayer",
          description:
            "Uma vez por turno, causa dano adicional a uma criatura já ferida.",
        },
        {
          value: "hunters-prey-giant-killer",
          label: "Giant Killer",
          description:
            "Permite reagir quando uma criatura Grande ou maior próxima atacar.",
        },
        {
          value: "hunters-prey-horde-breaker",
          label: "Horde Breaker",
          description:
            "Permite um ataque adicional contra outra criatura próxima do alvo.",
        },
      ],
    },
  },
  {
    matches: (slug) => slug.startsWith("defensive-tactics-ranger-hunter-"),
    descriptor: {
      key: "option",
      required: true,
      options: [
        {
          value: "defensive-tactics-escape-the-horde",
          label: "Escape the Horde",
          description:
            "Impõe desvantagem a ataques de oportunidade contra você.",
        },
        {
          value: "defensive-tactics-multiattack-defense",
          label: "Multiattack Defense",
          description:
            "Concede CA adicional contra ataques subsequentes da mesma criatura.",
        },
        {
          value: "defensive-tactics-steel-will",
          label: "Steel Will",
          description: "Concede vantagem contra ficar Amedrontado.",
        },
      ],
    },
  },
  {
    matches: (slug) => slug.startsWith("multiattack-ranger-hunter-"),
    descriptor: {
      key: "option",
      required: true,
      options: [
        {
          value: "multiattack-volley",
          label: "Volley",
          description:
            "Ataca criaturas à escolha dentro de uma área à distância.",
        },
        {
          value: "multiattack-whirlwind-attack",
          label: "Whirlwind Attack",
          description:
            "Ataca criaturas à escolha ao seu redor em alcance corpo a corpo.",
        },
      ],
    },
  },
  {
    matches: (slug) =>
      slug.startsWith("superior-hunters-defense-ranger-hunter-"),
    descriptor: {
      key: "option",
      required: true,
      options: [
        {
          value: "superior-hunters-defense-evasion",
          label: "Evasion",
          description: "Reduz ou evita dano em salvaguardas de Destreza.",
        },
        {
          value: "superior-hunters-defense-stand-against-the-tide",
          label: "Stand Against the Tide",
          description: "Redireciona um ataque que erre você.",
        },
        {
          value: "superior-hunters-defense-uncanny-dodge",
          label: "Uncanny Dodge",
          description:
            "Usa a reação para reduzir à metade o dano de um ataque.",
        },
      ],
    },
  },
];

const RANGER_HUNTER_CHOICE_CHILDREN: Array<{
  optionValue: string;
  featurePrefix: string;
}> = [
  {
    optionValue: "hunters-prey-colossus-slayer",
    featurePrefix: "colossus-slayer",
  },
  {
    optionValue: "hunters-prey-giant-killer",
    featurePrefix: "giant-killer",
  },
  {
    optionValue: "hunters-prey-horde-breaker",
    featurePrefix: "horde-breaker",
  },
  {
    optionValue: "defensive-tactics-escape-the-horde",
    featurePrefix: "escape-the-horde",
  },
  {
    optionValue: "defensive-tactics-multiattack-defense",
    featurePrefix: "multiattack-defense",
  },
  {
    optionValue: "defensive-tactics-steel-will",
    featurePrefix: "steel-will",
  },
  {
    optionValue: "multiattack-volley",
    featurePrefix: "volley",
  },
  {
    optionValue: "multiattack-whirlwind-attack",
    featurePrefix: "whirlwind-attack",
  },
  {
    optionValue: "superior-hunters-defense-evasion",
    featurePrefix: "evasion",
  },
  {
    optionValue: "superior-hunters-defense-stand-against-the-tide",
    featurePrefix: "stand-against-the-tide",
  },
  {
    optionValue: "superior-hunters-defense-uncanny-dodge",
    featurePrefix: "uncanny-dodge",
  },
];

const RANGER_PHB_SPELLS_KNOWN_BY_LEVEL = [
  0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11,
];

export interface MissingPrerequisite {
  ability: string;
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

  featureSourceFallback?: string;
}

@Injectable()
export class LevelUpService {
  private readonly logger = new Logger(LevelUpService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CampaignPartyMemberEntity)
    private readonly partyMemberRepo: Repository<CampaignPartyMemberEntity>,
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
    @InjectRepository(FeatureEntity)
    private readonly featureRepo: Repository<FeatureEntity>,
    @InjectRepository(SubclassEntity)
    private readonly subclassRepo: Repository<SubclassEntity>,
    @InjectRepository(SpellEntity)
    private readonly spellRepo: Repository<SpellEntity>,
    @InjectRepository(ProficiencyEntity)
    private readonly proficiencyRepo: Repository<ProficiencyEntity>,
    @InjectRepository(SpellClassEntity)
    private readonly spellClassRepo: Repository<SpellClassEntity>,
  ) {}

  async getOptions(
    userId: string,
    characterId: string,
  ): Promise<LevelUpOptionsResult> {
    const character = await this.ensureReadAccess(userId, characterId);
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

    const abilityMap = new Map<string, number>();
    for (const ca of charAbilities) {
      abilityMap.set(ca.ability_score.slug, ca.base_score + ca.bonus);
    }

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
      const canonical = normalizeClassSlug(group[0].slug);
      const charClass = currentCanonicalMap.get(canonical);
      if (charClass) return charClass.class;

      if (character.sourceId) {
        const same = group.find((c) => c.source_id === character.sourceId);
        if (same) return same;
      }

      const canonicalEntity = group.find((c) => c.slug === canonical);
      if (canonicalEntity) return canonicalEntity;

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

      if (!isCurrentClass && !isClassAvailable(cls.slug)) continue;

      const prereqs = this.parsePrerequisites(cls.multi_classing);
      const missingPrerequisites = isCurrentClass
        ? []
        : this.computeMissingPrerequisites(prereqs, abilityMap);
      const meetsPrereqs = missingPrerequisites.length === 0;

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

      const { levelData, fallbackSource } = await this.resolveLevelData(
        cls,
        nextClassLevel,
        character.source?.rules,
        null,
      );

      let subclassFeatureEntities: FeatureEntity[] = [];

      if (charClass?.subclass_id) {
        const { levelData: subLevelData } = await this.resolveLevelData(
          cls,
          nextClassLevel,
          character.source?.rules,
          charClass.subclass_id,
        );
        const directOrLinked = this.mergeFeatures(
          this.filterCompatibleLinkedFeatures(
            subLevelData?.level_features?.map((lf) => lf.feature) ?? [],
            cls,
            character.source?.rules,
          ),
          await this.findDirectFeatures(
            cls.id,
            nextClassLevel,
            charClass.subclass_id,
            cls.source_id,
          ),
        );
        if (directOrLinked.length > 0) {
          subclassFeatureEntities = directOrLinked;
        }
      }

      const hasAsi = (levelData?.ability_score_bonuses ?? 0) > 0;

      const editionRules = character.source?.rules;
      const hasSubclass =
        this.isSubclassLevel(cls.slug, nextClassLevel, editionRules) &&
        !charClass?.subclass_id;

      let availableSubclassEntities: SubclassEntity[] = [];
      if (hasSubclass) {
        const subs = await this.subclassRepo.find({
          where: { class_id: cls.id },
        });

        const allowed = new Set(getCanonicalSubclassSlugs(cls.slug));
        availableSubclassEntities = subs.filter(
          (subclass) =>
            allowed.has(subclass.slug) ||
            allowed.has(subclass.slug.replace(/-phb$/, "")),
        );
        for (const subclass of availableSubclassEntities) {
          const { levelData: candidateLevelData } = await this.resolveLevelData(
            cls,
            nextClassLevel,
            character.source?.rules,
            subclass.id,
          );
          const candidateFeatures = this.mergeFeatures(
            this.filterCompatibleLinkedFeatures(
              candidateLevelData?.level_features?.map((lf) => lf.feature) ?? [],
              cls,
              character.source?.rules,
            ),
            await this.findDirectFeatures(
              cls.id,
              nextClassLevel,
              subclass.id,
              cls.source_id,
            ),
          );
          subclassFeatureEntities = this.mergeFeatures(
            subclassFeatureEntities,
            candidateFeatures,
          );
        }
      }
      const availableSubclasses = availableSubclassEntities.map((subclass) => ({
        slug: subclass.slug,
        name: subclass.name,
      }));

      const classFeatures = this.mergeFeatures(
        this.filterCompatibleLinkedFeatures(
          levelData?.level_features?.map((lf) => lf.feature) ?? [],
          cls,
          character.source?.rules,
        ),
        await this.findDirectFeatures(
          cls.id,
          nextClassLevel,
          null,
          cls.source_id,
        ),
      );
      const features = [
        ...classFeatures.map((feature) =>
          this.toAvailableFeature(feature, false),
        ),
        ...subclassFeatureEntities
          .filter((feature) => !this.isRangerChoiceChildFeature(feature.slug))
          .map((feature) => this.toAvailableFeature(feature, true)),
      ];

      let newProficiencies: Array<{ slug: string; name: string }> = [];
      if (!isCurrentClass && nextClassLevel === 1) {
        newProficiencies = this.getMulticlassProficiencies(cls.multi_classing);
      }

      const spellcasting = levelData?.spellcasting ?? null;

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
        features,
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

  async execute(
    userId: string,
    characterId: string,
    dto: LevelUpDto,
  ): Promise<LevelUpResult> {
    await this.ensureWriteAccess(userId, characterId);
    const state = await this.getState(characterId);
    const charClasses = await this.charClassRepo.find({
      where: { character_id: characterId },
      order: { order: "ASC" },
    });
    const charAbilities = await this.charAbilityRepo.find({
      where: { character_id: characterId },
    });

    const totalLevel = charClasses.reduce((s, cc) => s + cc.class_level, 0);

    if (totalLevel >= 20) {
      throw new BadRequestException("Personagem ja esta no nivel maximo (20).");
    }

    const xpRequired = XP_THRESHOLDS[totalLevel];
    if (state.xp < xpRequired) {
      throw new BadRequestException(
        `XP insuficiente. Necessario: ${xpRequired}, atual: ${state.xp}.`,
      );
    }

    const inputCanonical = normalizeClassSlug(dto.classSlug.toLowerCase());
    const existingCharClass = charClasses.find(
      (cc) => normalizeClassSlug(cc.class.slug) === inputCanonical,
    );

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
    const elementalFuryChoice =
      inputCanonical === "druid" && newClassLevel === 7
        ? this.resolveElementalFuryChoice(dto.featureChoices)
        : null;
    if (
      inputCanonical === "druid" &&
      newClassLevel === 7 &&
      !elementalFuryChoice
    ) {
      throw new BadRequestException({
        code: "FEATURE_CHOICE_REQUIRED",
        field: "featureChoices",
        featureSlug: "elemental-fury",
        error:
          "Escolha Ataque Primordial ou Conjuração Potente para Fúria Elemental.",
      });
    }

    if (inputCanonical === "wizard" && !isNewClass && newClassLevel > 1) {
      this.validateWizardSpellSelection(dto.newSpells);
      await this.validateWizardSpellsDeep(
        dto.newSpells!,
        classEntity,
        newClassLevel,
        characterId,
      );
    }

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

    const abilityMap = new Map<string, number>();
    for (const ca of charAbilities) {
      abilityMap.set(ca.ability_score.slug, ca.base_score + ca.bonus);
    }
    const currentConScore = abilityMap.get("con") ?? 10;
    const conMod = getAbilityModifier(currentConScore);
    const conIncreaseRequested = (dto.abilityScoreIncreases ?? [])
      .filter((increase) => increase.abilitySlug === "con")
      .reduce((total, increase) => total + increase.increase, 0);
    const abilityScoreCap = dto.featSlug && totalLevel >= 19 ? 30 : 20;
    const conScoreAfterIncrease = Math.min(
      abilityScoreCap,
      currentConScore + conIncreaseRequested,
    );
    const conModIncrease = Math.max(
      0,
      getAbilityModifier(conScoreAfterIncrease) - conMod,
    );
    const retroactiveConHp = conModIncrease * newTotalLevel;
    // computeSheet already uses the current CON modifier for the first level.
    // Persist the remaining retroactive delta in this level-up row so every
    // max-HP reader converges with current_hp after the ASI.
    const retroactiveConHpForPreviousLevels =
      conModIncrease * Math.max(0, newTotalLevel - 1);

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
      hpGained = Math.floor(classEntity.hit_die / 2) + 1 + conMod;
    }

    hpGained = Math.max(1, hpGained);

    return this.dataSource.transaction(async (manager) => {
      const newFeatures: string[] = [];

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

            existingCharClass.subclass = subclass;
          }
        }
        await manager.save(CharacterClassEntity, existingCharClass);
      }

      await manager.save(CharacterLevelUpEntity, {
        character_id: characterId,
        total_level: newTotalLevel,
        class_id: classEntity.id,
        hp_gained: hpGained + retroactiveConHpForPreviousLevels,
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

      state.current_hp += hpGained;
      await manager.save(CharacterStateEntity, state);

      const character = await this.ensureReadAccess(userId, characterId);
      const { levelData, fallbackSource } = await this.resolveLevelData(
        classEntity,
        newClassLevel,
        character.source?.rules,
        null,
      );

      const classFeatures = this.mergeFeatures(
        this.filterCompatibleLinkedFeatures(
          levelData?.level_features?.map((lf) => lf.feature) ?? [],
          classEntity,
          character.source?.rules,
        ),
        await manager.find(FeatureEntity, {
          where: {
            class_id: classEntity.id,
            subclass_id: IsNull(),
            level: newClassLevel,
            ...(classEntity.source_id
              ? { source_id: classEntity.source_id }
              : {}),
          },
        }),
      );
      for (const feature of classFeatures) {
        if (
          elementalFuryChoice &&
          (feature.slug.startsWith("primal-strike-") ||
            feature.slug.startsWith("potent-spellcasting-")) &&
          !isElementalFuryFeatureSlug(feature.slug, elementalFuryChoice)
        ) {
          continue;
        }
        const choices = feature.slug.startsWith("elemental-fury-")
          ? { option: elementalFuryChoice }
          : this.resolveFeatureChoicesForSave(feature, dto.featureChoices);
        await manager.save(CharacterFeatureEntity, {
          character_id: characterId,
          feature_id: feature.id,
          source_class_id: classEntity.id,
          active: true,
          choices,
        });
        newFeatures.push(feature.name);
      }

      const charClass = isNewClass
        ? await manager.findOne(CharacterClassEntity, {
            where: { character_id: characterId, class_id: classEntity.id },
          })
        : existingCharClass;

      if (charClass?.subclass_id) {
        const subclassJustPicked = Boolean(dto.subclassSlug);
        const levelsToProcess: number[] = subclassJustPicked
          ? Array.from({ length: newClassLevel }, (_, i) => i + 1)
          : [newClassLevel];

        for (const lv of levelsToProcess) {
          const { levelData: subLevelData } = await this.resolveLevelData(
            classEntity,
            lv,
            character.source?.rules,
            charClass.subclass_id,
          );
          const subclassFeatures = this.mergeFeatures(
            this.filterCompatibleLinkedFeatures(
              subLevelData?.level_features?.map((lf) => lf.feature) ?? [],
              classEntity,
              character.source?.rules,
            ),
            await manager.find(FeatureEntity, {
              where: {
                class_id: classEntity.id,
                subclass_id: charClass.subclass_id,
                level: lv,
                ...(classEntity.source_id
                  ? { source_id: classEntity.source_id }
                  : {}),
              },
            }),
          );
          for (const feature of subclassFeatures) {
            if (
              !this.shouldMaterializeRangerChoiceChild(
                feature.slug,
                dto.featureChoices,
              )
            ) {
              continue;
            }
            const existing = await manager.findOne(CharacterFeatureEntity, {
              where: {
                character_id: characterId,
                feature_id: feature.id,
              },
            });
            if (existing) continue;
            await manager.save(CharacterFeatureEntity, {
              character_id: characterId,
              feature_id: feature.id,
              source_class_id: classEntity.id,
              active: true,
              choices: this.resolveFeatureChoicesForSave(
                feature,
                dto.featureChoices,
              ),
            });
            newFeatures.push(feature.name);
          }
        }
      }

      if (dto.abilityScoreIncreases?.length) {
        let totalIncrease = 0;
        for (const asi of dto.abilityScoreIncreases) {
          totalIncrease += asi.increase;
          const abilityRecord = charAbilities.find(
            (ca) => ca.ability_score.slug === asi.abilitySlug,
          );
          if (abilityRecord) {
            abilityRecord.bonus += asi.increase;

            const isEpicBoon = dto.featSlug && totalLevel >= 19;
            const cap = isEpicBoon ? 30 : 20;
            const totalScore = abilityRecord.base_score + abilityRecord.bonus;
            if (totalScore > cap) {
              abilityRecord.bonus = cap - abilityRecord.base_score;
            }
            await manager.save(CharacterAbilityScoreEntity, abilityRecord);
          }
        }

        if (retroactiveConHp > 0) {
          state.current_hp += retroactiveConHp;
          await manager.save(CharacterStateEntity, state);
        }
      }

      if (dto.newSpells?.length) {
        const casterType = getCasterClassType(classEntity.slug);
        for (const spellSlug of dto.newSpells) {
          const spell = await this.spellRepo.findOneBy({ slug: spellSlug });
          if (!spell) continue;

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

      if (dto.preparedSpells) {
        const casterType = getCasterClassType(classEntity.slug);
        if (casterType === "spellbook" || casterType === "total_access") {
          const preparedSet = new Set(dto.preparedSpells);

          const allCharSpells = await manager.find(CharacterSpellEntity, {
            where: { character_id: characterId, source: SpellSourceEnum.Class },
            relations: ["spell"],
          });

          const bySlug = new Map<string, CharacterSpellEntity[]>();
          for (const cs of allCharSpells) {
            if (cs.spell.level === 0 || cs.always_prepared) continue;
            const existing = bySlug.get(cs.spell.slug) ?? [];
            existing.push(cs);
            bySlug.set(cs.spell.slug, existing);
          }

          for (const [slug, records] of bySlug) {
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

    const newCantrips = Math.max(
      0,
      (newSc["cantrips_known"] ?? 0) - (prevSc["cantrips_known"] ?? 0),
    );

    let maxSpellLevel = 0;
    for (let i = 1; i <= 9; i++) {
      if ((newSc[`spell_slots_level_${i}`] ?? 0) > 0) {
        maxSpellLevel = i;
      }
    }
    if (maxSpellLevel === 0) {
      const slotType = getCasterSlotType(cls.slug);
      if (slotType === "full" || slotType === "half") {
        const casterLevel = getStandardCasterLevelContribution(
          cls.slug,
          newClassLevel,
          false,
        );
        maxSpellLevel =
          FULL_CASTER_SLOTS[Math.min(casterLevel, 20)]?.length ?? 0;
      } else if (slotType === "pact") {
        maxSpellLevel = WARLOCK_SLOTS[newClassLevel - 1]?.level ?? 0;
      }
    }

    let newSpells = 0;
    let canSwapSpell = false;

    if (casterType === "known" || casterType === "pact") {
      const newKnownSpells = this.getKnownSpellsAtLevel(
        cls.slug,
        newClassLevel,
        newSc,
      );
      const previousKnownSpells = this.getKnownSpellsAtLevel(
        cls.slug,
        currentClassLevel,
        prevSc,
      );
      newSpells = Math.max(0, newKnownSpells - previousKnownSpells);
      canSwapSpell = currentClassLevel > 0;
    } else if (casterType === "spellbook") {
      newSpells = 2;
    }

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

  private getKnownSpellsAtLevel(
    classSlug: string,
    classLevel: number,
    spellcasting: Record<string, number>,
  ): number {
    if (classLevel <= 0) return 0;
    if (typeof spellcasting["spells_known"] === "number") {
      return spellcasting["spells_known"];
    }
    if (
      classSlug.endsWith("-phb") &&
      normalizeClassSlug(classSlug) === "ranger"
    ) {
      return RANGER_PHB_SPELLS_KNOWN_BY_LEVEL[
        Math.min(classLevel, RANGER_PHB_SPELLS_KNOWN_BY_LEVEL.length) - 1
      ];
    }
    return 0;
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
        const formula = getPreparedFormula(
          normalizeClassSlug(classSlug),
          editionRules,
        );
        if (formula === "halfLevel+mod") {
          return Math.max(1, Math.floor(classLevel / 2) + abilityMod);
        }

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

  private async ensureReadAccess(
    userId: string,
    characterId: string,
  ): Promise<CharacterEntity> {
    return ensureCharacterReadAccess(
      this.characterRepo,
      userId,
      characterId,
      this.partyMemberRepo,
      ["source"],
    );
  }

  private async ensureWriteAccess(
    userId: string,
    characterId: string,
  ): Promise<CharacterEntity> {
    return ensureCharacterWriteAccess(
      this.characterRepo,
      userId,
      characterId,
      this.partyMemberRepo,
      ["source"],
    );
  }

  private findDirectFeatures(
    classId: string,
    level: number,
    subclassId: string | null,
    sourceId?: string,
  ): Promise<FeatureEntity[]> {
    return this.featureRepo.find({
      where: {
        class_id: classId,
        subclass_id: subclassId ?? IsNull(),
        level,
        ...(sourceId ? { source_id: sourceId } : {}),
      },
    });
  }

  private mergeFeatures(
    linked: FeatureEntity[],
    direct: FeatureEntity[],
  ): FeatureEntity[] {
    return [
      ...new Map(
        [...linked, ...direct].map((feature) => [feature.id, feature]),
      ).values(),
    ];
  }

  private filterCompatibleLinkedFeatures(
    linked: FeatureEntity[],
    classEntity: ClassEntity,
    rules: EditionRules | undefined,
  ): FeatureEntity[] {
    const fallbackSource = rules?.featureFallbackSource;
    return linked.filter(
      (feature) =>
        feature.source_id == null ||
        feature.source_id === classEntity.source_id ||
        feature.source?.code === "SRD" ||
        (fallbackSource != null && feature.source?.code === fallbackSource),
    );
  }

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

    const nativeRows = await this.levelRepo.find({
      where: whereClause,
      relations: [
        "level_features",
        "level_features.feature",
        "level_features.feature.source",
      ],
    });
    if (nativeRows.length > 0) {
      const sourceMatched =
        nativeRows.find(
          (row) =>
            classEntity.source_id != null &&
            row.source_id === classEntity.source_id,
        ) ?? nativeRows[0];
      return { levelData: sourceMatched };
    }

    const fallbackCode = rules?.featureFallbackSource;
    if (!fallbackCode || subclassId) {
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
      relations: [
        "level_features",
        "level_features.feature",
        "level_features.feature.source",
      ],
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

  private async validateWizardSpellsDeep(
    slugs: string[],
    wizardClass: ClassEntity,
    newClassLevel: number,
    characterId: string,
  ): Promise<void> {
    const slots = FULL_CASTER_SLOTS[newClassLevel] ?? [];
    const maxSpellLevel = slots.length;

    const existing = await this.charSpellRepo.find({
      where: { character_id: characterId },
      relations: ["spell"],
    });
    const existingSlugs = new Set(existing.map((cs) => cs.spell.slug));

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

  private getFeatureChoiceDescriptor(
    featureSlug: string,
  ): FeatureChoiceDescriptor | undefined {
    if (featureSlug.startsWith("elemental-fury-")) {
      return {
        key: "option",
        required: true,
        options: [
          {
            value: "primal-strike",
            label: "Ataque Primordial",
            description:
              "Uma vez por turno, adiciona dano elemental a um acerto com arma ou ataque de Fera em Forma Selvagem.",
          },
          {
            value: "potent-spellcasting",
            label: "Conjuração Potente",
            description:
              "Adiciona o modificador de Sabedoria ao dano dos truques de Druida.",
          },
        ],
      };
    }
    const normalized = featureSlug.replace(/-(?:phb|xphb|srd52)$/, "");
    return RANGER_HUNTER_FEATURE_CHOICES.find((entry) =>
      entry.matches(normalized),
    )?.descriptor;
  }

  private getRangerChoiceChild(
    featureSlug: string,
  ): (typeof RANGER_HUNTER_CHOICE_CHILDREN)[number] | undefined {
    const normalized = featureSlug.replace(/-(?:phb|xphb|srd52)$/, "");
    return RANGER_HUNTER_CHOICE_CHILDREN.find((entry) =>
      normalized.startsWith(`${entry.featurePrefix}-ranger-hunter-`),
    );
  }

  private isRangerChoiceChildFeature(featureSlug: string): boolean {
    return this.getRangerChoiceChild(featureSlug) !== undefined;
  }

  private shouldMaterializeRangerChoiceChild(
    featureSlug: string,
    featureChoices?: Record<string, unknown>,
  ): boolean {
    const child = this.getRangerChoiceChild(featureSlug);
    if (!child) return true;
    const parentChoice = RANGER_HUNTER_FEATURE_CHOICES.find((entry) =>
      entry.descriptor.options.some(
        (option) => option.value === child.optionValue,
      ),
    );
    if (!parentChoice) return false;
    return Object.entries(featureChoices ?? {}).some(([parentSlug, raw]) => {
      const normalizedParentSlug = parentSlug.replace(
        /-(?:phb|xphb|srd52)$/,
        "",
      );
      if (!parentChoice.matches(normalizedParentSlug)) return false;
      const selected =
        raw && typeof raw === "object"
          ? (raw as Record<string, unknown>).option
          : raw;
      return selected === child.optionValue;
    });
  }

  private toAvailableFeature(
    feature: FeatureEntity,
    isSubclassFeature: boolean,
  ): AvailableClassOption["features"][number] {
    const choice = this.getFeatureChoiceDescriptor(feature.slug);
    return {
      slug: feature.slug,
      name: feature.name,
      description: feature.description,
      isSubclassFeature,
      ...(choice ? { choice } : {}),
    };
  }

  private resolveFeatureChoicesForSave(
    feature: FeatureEntity,
    featureChoices?: Record<string, unknown>,
  ): Record<string, unknown> {
    const raw = featureChoices?.[feature.slug];
    const descriptor = this.getFeatureChoiceDescriptor(feature.slug);
    if (!descriptor) {
      return raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};
    }

    const selected =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)[descriptor.key]
        : raw;
    const allowed = descriptor.options.some(
      (option) => option.value === selected,
    );
    if (!allowed) {
      throw new BadRequestException({
        code: "FEATURE_CHOICE_REQUIRED",
        field: "featureChoices",
        featureSlug: feature.slug,
        choiceKey: descriptor.key,
        allowedValues: descriptor.options.map((option) => option.value),
        error: `Escolha válida obrigatória para ${feature.name}.`,
      });
    }
    return { [descriptor.key]: selected };
  }

  private resolveElementalFuryChoice(
    featureChoices?: Record<string, unknown>,
  ): ElementalFuryChoice | null {
    for (const [slug, value] of Object.entries(featureChoices ?? {})) {
      if (slug === "elemental-fury" || slug.startsWith("elemental-fury-")) {
        return normalizeElementalFuryChoice(value);
      }
    }
    return null;
  }

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

  private isSubclassLevel(
    classSlug: string,
    level: number,
    editionRules?: EditionRules,
  ): boolean {
    const normalized = classSlug.replace(/-phb$/, "");
    const subclassLevel = getSubclassLevelFromRules(normalized, editionRules);

    return subclassLevel > 1 && level === subclassLevel;
  }
}
