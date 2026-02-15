import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
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
} from 'src/entities';
import {
  HpMethodEnum,
  SpellSourceEnum,
  SpellStatusEnum,
  CharacterProficiencySourceEnum,
} from 'src/entities/enums';

// Caster type classification for level-up spell selection
type CasterType = 'total_access' | 'known' | 'spellbook' | 'pact';

const CASTER_CLASS_TYPE: Record<string, CasterType> = {
  cleric: 'total_access',
  druid: 'total_access',
  paladin: 'total_access',
  bard: 'known',
  sorcerer: 'known',
  ranger: 'known',
  warlock: 'pact',
  wizard: 'spellbook',
};

// SRD Character Advancement XP thresholds (index 0 = level 1 => need 300 for level 2)
const XP_THRESHOLDS: number[] = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

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
  slug: string;
  name: string;
  isCurrentClass: boolean;
  hitDie: number;
  meetsPrerequisites: boolean;
  prerequisites: MulticlassPrereq[];
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

export interface SpellSelectionForLevelUp {
  casterType: CasterType;
  newCantrips: number;
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
  hpMethod: 'roll' | 'fixed';
  hpRoll?: number;
  subclassSlug?: string;
  abilityScoreIncreases?: Array<{ abilitySlug: string; increase: number }>;
  featSlug?: string;
  newSpells?: string[];
  removedSpells?: string[];
  featureChoices?: Record<string, unknown>;
}

export interface LevelUpResult {
  totalLevel: number;
  classLevel: number;
  className: string;
  hpGained: number;
  newFeatures: string[];
  message: string;
}

@Injectable()
export class LevelUpService {
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
        order: { order: 'ASC' },
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

    // All classes available
    const allClasses = await this.classRepo.find();
    const currentClassSlugs = new Set(charClasses.map((cc) => cc.class.slug));

    const availableClasses: AvailableClassOption[] = [];
    const hitDie: Record<string, number> = {};

    for (const cls of allClasses) {
      const isCurrentClass = currentClassSlugs.has(cls.slug);
      const charClass = charClasses.find((cc) => cc.class.slug === cls.slug);
      const nextClassLevel = isCurrentClass ? charClass!.class_level + 1 : 1;

      // Parse multiclassing prerequisites
      const prereqs = this.parsePrerequisites(cls.multi_classing);
      const meetsPrereqs =
        isCurrentClass ||
        this.checkPrerequisites(prereqs, abilityMap, charClasses);

      // For multiclass: also need to meet current class prereqs
      if (!isCurrentClass && meetsPrereqs) {
        const currentPrimaryClass = charClasses[0]?.class;
        if (currentPrimaryClass) {
          const currentPrereqs = this.parsePrerequisites(
            currentPrimaryClass.multi_classing,
          );
          const meetsCurrent = this.checkPrerequisites(
            currentPrereqs,
            abilityMap,
            charClasses,
          );
          if (!meetsCurrent) continue;
        }
      }

      // Load level data for the next class level
      const levelData = await this.levelRepo.findOne({
        where: {
          class_id: cls.id,
          level: nextClassLevel,
          subclass_id: IsNull(),
        },
        relations: ['level_features', 'level_features.feature'],
      });

      // Also load subclass level data if character has a subclass for this class
      let subclassFeatures: Array<{
        slug: string;
        name: string;
        description: unknown;
        isSubclassFeature: boolean;
      }> = [];

      if (charClass?.subclass_id) {
        const subLevelData = await this.levelRepo.findOne({
          where: {
            class_id: cls.id,
            level: nextClassLevel,
            subclass_id: charClass.subclass_id,
          },
          relations: ['level_features', 'level_features.feature'],
        });
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

      // Check if this level requires subclass choice
      const hasSubclass =
        this.isSubclassLevel(cls.slug, nextClassLevel) &&
        !charClass?.subclass_id;

      // Available subclasses
      let availableSubclasses: Array<{ slug: string; name: string }> = [];
      if (hasSubclass) {
        const subs = await this.subclassRepo.find({
          where: { class_id: cls.id },
        });
        availableSubclasses = subs.map((s) => ({ slug: s.slug, name: s.name }));
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
        isCurrentClass ? charClass!.class_level : 0,
        charSpells,
      );

      hitDie[cls.slug] = cls.hit_die;

      availableClasses.push({
        slug: cls.slug,
        name: cls.name,
        isCurrentClass,
        hitDie: cls.hit_die,
        meetsPrerequisites: meetsPrereqs,
        prerequisites: prereqs,
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
      order: { order: 'ASC' },
    });
    const charAbilities = await this.charAbilityRepo.find({
      where: { character_id: characterId },
    });

    const totalLevel = charClasses.reduce((s, cc) => s + cc.class_level, 0);

    // Validate: level cap
    if (totalLevel >= 20) {
      throw new BadRequestException('Personagem ja esta no nivel maximo (20).');
    }

    // Validate: XP
    const xpRequired = XP_THRESHOLDS[totalLevel];
    if (state.xp < xpRequired) {
      throw new BadRequestException(
        `XP insuficiente. Necessario: ${xpRequired}, atual: ${state.xp}.`,
      );
    }

    // Resolve class
    const classEntity = await this.classRepo.findOneBy({ slug: dto.classSlug });
    if (!classEntity) {
      throw new BadRequestException(
        `Classe '${dto.classSlug}' nao encontrada.`,
      );
    }

    const existingCharClass = charClasses.find(
      (cc) => cc.class.slug === dto.classSlug,
    );
    const isNewClass = !existingCharClass;
    const newClassLevel = isNewClass ? 1 : existingCharClass!.class_level + 1;
    const newTotalLevel = totalLevel + 1;

    // Validate multiclass prerequisites
    if (isNewClass) {
      const abilityMap = new Map<string, number>();
      for (const ca of charAbilities) {
        abilityMap.set(ca.ability_score.slug, ca.base_score + ca.bonus);
      }

      // Must meet new class prereqs
      const newPrereqs = this.parsePrerequisites(classEntity.multi_classing);
      if (!this.checkPrerequisites(newPrereqs, abilityMap, charClasses)) {
        throw new BadRequestException(
          `Pre-requisitos de multiclasse para ${classEntity.name} nao atendidos.`,
        );
      }

      // Must meet current class prereqs
      const primaryClass = charClasses[0]?.class;
      if (primaryClass) {
        const currentPrereqs = this.parsePrerequisites(
          primaryClass.multi_classing,
        );
        if (!this.checkPrerequisites(currentPrereqs, abilityMap, charClasses)) {
          throw new BadRequestException(
            'Pre-requisitos de multiclasse da classe atual nao atendidos.',
          );
        }
      }
    }

    // Build ability score map for CON mod calculation
    const abilityMap = new Map<string, number>();
    for (const ca of charAbilities) {
      abilityMap.set(ca.ability_score.slug, ca.base_score + ca.bonus);
    }
    const conMod = Math.floor(((abilityMap.get('con') ?? 10) - 10) / 2);

    // Calculate HP gained
    let hpGained: number;
    if (dto.hpMethod === 'roll') {
      if (dto.hpRoll === undefined || dto.hpRoll === null) {
        throw new BadRequestException('Valor da rolagem de HP e obrigatorio.');
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
        existingCharClass!.class_level = newClassLevel;
        if (dto.subclassSlug && !existingCharClass!.subclass_id) {
          const subclass = await this.subclassRepo.findOneBy({
            slug: dto.subclassSlug,
          });
          if (subclass) {
            existingCharClass!.subclass_id = subclass.id;
          }
        }
        await manager.save(CharacterClassEntity, existingCharClass!);
      }

      // 2. Create LevelUp record
      await manager.save(CharacterLevelUpEntity, {
        character_id: characterId,
        total_level: newTotalLevel,
        class_id: classEntity.id,
        hp_gained: hpGained,
        hp_method:
          dto.hpMethod === 'roll' ? HpMethodEnum.Roll : HpMethodEnum.Fixed,
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

      // 4. Add features from the level
      const levelData = await this.levelRepo.findOne({
        where: {
          class_id: classEntity.id,
          level: newClassLevel,
          subclass_id: IsNull(),
        },
        relations: ['level_features', 'level_features.feature'],
      });

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
        const subLevelData = await this.levelRepo.findOne({
          where: {
            class_id: classEntity.id,
            level: newClassLevel,
            subclass_id: charClass.subclass_id,
          },
          relations: ['level_features', 'level_features.feature'],
        });
        if (subLevelData?.level_features) {
          for (const lf of subLevelData.level_features) {
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
            // Cap at 20
            const totalScore = abilityRecord.base_score + abilityRecord.bonus;
            if (totalScore > 20) {
              abilityRecord.bonus = 20 - abilityRecord.base_score;
            }
            await manager.save(CharacterAbilityScoreEntity, abilityRecord);
          }
        }

        // If CON changed, retroactive HP adjustment
        if (dto.abilityScoreIncreases.some((a) => a.abilitySlug === 'con')) {
          const newConScore = abilityMap.get('con') ?? 10;
          const conAsi = dto.abilityScoreIncreases.find(
            (a) => a.abilitySlug === 'con',
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
        for (const spellSlug of dto.newSpells) {
          const spell = await this.spellRepo.findOneBy({ slug: spellSlug });
          if (!spell) continue;
          // Check if already exists
          const existing = await manager.findOne(CharacterSpellEntity, {
            where: { character_id: characterId, spell_id: spell.id },
          });
          if (existing) continue;

          await manager.save(CharacterSpellEntity, {
            character_id: characterId,
            spell_id: spell.id,
            source: SpellSourceEnum.Class,
            status:
              spell.level === 0
                ? SpellStatusEnum.Known
                : SpellStatusEnum.Prepared,
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
  ): Promise<SpellSelectionForLevelUp | null> {
    const casterType = CASTER_CLASS_TYPE[cls.slug];
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
      (newSc['cantrips_known'] ?? 0) - (prevSc['cantrips_known'] ?? 0),
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

    if (casterType === 'known' || casterType === 'pact') {
      newSpells = Math.max(
        0,
        (newSc['spells_known'] ?? 0) - (prevSc['spells_known'] ?? 0),
      );
      canSwapSpell = currentClassLevel > 0; // can swap 1 spell at level-up (not at level 1)
    } else if (casterType === 'spellbook') {
      newSpells = 2; // wizard adds 2 spells to spellbook per level
    }

    // Character's current cantrips and spells for this class
    const currentCantrips = charSpells
      .filter(
        (cs) => cs.source === SpellSourceEnum.Class && cs.spell.level === 0,
      )
      .map((cs) => ({ slug: cs.spell.slug, name: cs.spell.name }));

    const currentSpells = charSpells
      .filter((cs) => cs.source === SpellSourceEnum.Class && cs.spell.level > 0)
      .map((cs) => ({
        slug: cs.spell.slug,
        name: cs.spell.name,
        level: cs.spell.level,
      }));

    // Available spells from the class spell list
    const classSpellLinks = await this.spellClassRepo.find({
      where: { class_id: cls.id },
      relations: ['spell'],
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

    return {
      casterType,
      newCantrips,
      newSpells,
      canSwapSpell,
      maxSpellLevel,
      currentCantrips,
      currentSpells,
      availableCantrips,
      availableSpells,
    };
  }

  private async ensureOwnership(
    userId: string,
    characterId: string,
  ): Promise<CharacterEntity> {
    const character = await this.characterRepo.findOne({
      where: { id: characterId, userId },
    });
    if (!character) {
      throw new NotFoundException('Personagem nao encontrado.');
    }
    return character;
  }

  private async getState(characterId: string): Promise<CharacterStateEntity> {
    const state = await this.stateRepo.findOne({
      where: { character_id: characterId },
    });
    if (!state) {
      throw new NotFoundException('Estado do personagem nao encontrado.');
    }
    return state;
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

  /** Subclass selection levels per class (SRD 5e) */
  private isSubclassLevel(classSlug: string, level: number): boolean {
    const subclassLevels: Record<string, number> = {
      barbarian: 3,
      bard: 3,
      cleric: 1, // Divine Domain at 1 (already chosen at creation)
      druid: 2,
      fighter: 3,
      monk: 3,
      paladin: 3,
      ranger: 3,
      rogue: 3,
      sorcerer: 1, // Sorcerous Origin at 1 (already chosen at creation)
      warlock: 1, // Otherworldly Patron at 1 (already chosen at creation)
      wizard: 2,
    };
    // Only trigger subclass choice at the defined level
    // If class chooses subclass at level 1, it's done at creation, so skip
    const subclassLevel = subclassLevels[classSlug];
    return (
      subclassLevel !== undefined &&
      subclassLevel > 1 &&
      level === subclassLevel
    );
  }
}
