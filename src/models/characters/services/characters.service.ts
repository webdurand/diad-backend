import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  CharacterEntity,
  CharacterClassEntity,
  CharacterAbilityScoreEntity,
  CharacterSkillEntity,
  CharacterProficiencyEntity,
  CharacterSpellEntity,
  CharacterEquipmentEntity,
  CharacterStateEntity,
  CharacterOriginEntity,
  CharacterFeatureEntity,
  ClassEntity,
  ClassStartingEquipmentEntity,
  AbilityScoreEntity,
  SkillEntity,
  ProficiencyEntity,
  SpellEntity,
  EquipmentEntity,
  RaceEntity,
  SubraceEntity,
  BackgroundEntity,
  AlignmentEntity,
  LevelEntity,
  CompSourceEntity,
} from 'src/entities';
import {
  CharacterProficiencySourceEnum,
  EquipmentSourceEnum,
  SpellSourceEnum,
  SpellStatusEnum,
} from 'src/entities/enums';
import { getAbilityModifier } from 'src/shared/srd-utils';

interface CharacterChoicesData {
  sourceCode?: string;
  raceSlug?: string;
  subraceSlug?: string;
  classSlug?: string;
  backgroundSlug?: string;
  alignmentSlug?: string;
  abilityScores?: Record<string, number>;
  abilityScoreMethod?: string;
  backgroundAbilityBonuses?: Array<{
    abilityScoreIndex: string;
    bonus: number;
  }>;
  skills?: string[];
  expertiseSkills?: string[];
  raceProficiencyChoices?: string[];
  backgroundProficiencyChoices?: string[];
  classCantrips?: string[];
  classPreparedSpells?: string[];
  classSpellbook?: string[];
  raceSpellChoices?: string[];
  personality?: Record<string, string>;
  speciesSize?: string;
  speciesSpellcastingAbility?: string;
  age?: string;
  height?: string;
  weight?: string;
  raceTraitChoices?: string[];
  raceFeatChoiceSlug?: string;
  raceLanguageChoices?: string[];
  divineOrder?: string;
  primalOrder?: string;
  fightingStyleSlug?: string;
  classEquipmentChoices?: string[];
  backgroundEquipmentChoices?: string[];
  classStartingGold?: Record<string, unknown>;
  eldritchInvocations?: string[];
  eldritchInvocationSubChoices?: Record<string, unknown>;
  weaponMasteryChoices?: string[];
  classLanguageChoices?: string[];
  classToolProficiency?: string;
}

interface CreateCharacterInput {
  userId: string;
  name: string;
  data: Record<string, unknown>;
  choices?: Record<string, unknown>;
}

interface UpdateCharacterInput {
  name?: string;
}

const ABILITY_SLUGS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
type AbilitySlug = (typeof ABILITY_SLUGS)[number];

// Aceita tanto slugs longos (strength/dexterity/...) quanto curtos (str/dex/...).
const SLUG_MAP: Record<string, AbilitySlug> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
  str: 'str',
  dex: 'dex',
  con: 'con',
  int: 'int',
  wis: 'wis',
  cha: 'cha',
};

function hasStartingEquipmentOptions(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  if (!raw) return false;
  const options = (raw as { options?: unknown }).options;
  if (Array.isArray(options)) return options.length > 0;
  if (Array.isArray(raw as unknown as unknown[])) {
    return (raw as unknown as unknown[]).length > 0;
  }
  return Object.keys(raw).length > 0;
}

type EquipmentLite = {
  id: string;
  slug: string;
  name: string;
  armor_class?: Record<string, unknown> | null;
  weapon_category?: string | null;
};

function decideEquipSlot(
  eq: EquipmentLite,
): 'armor' | 'shield' | 'weapon' | null {
  const slug = (eq.slug ?? '').toLowerCase();
  const name = (eq.name ?? '').toLowerCase();
  if (slug === 'shield' || name === 'shield') return 'shield';
  if (eq.armor_class && Object.keys(eq.armor_class).length > 0) return 'armor';
  if (eq.weapon_category) return 'weapon';
  return null;
}

function normalizeAbilityScores(
  raw: Record<string, unknown> | undefined,
): Record<AbilitySlug, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Partial<Record<AbilitySlug, number>> = {};
  for (const [key, value] of Object.entries(raw)) {
    const slug = SLUG_MAP[key.toLowerCase()];
    if (!slug) continue;
    if (typeof value !== 'number' || !Number.isInteger(value)) continue;
    out[slug] = value;
  }
  return Object.keys(out).length > 0
    ? (out as Record<AbilitySlug, number>)
    : undefined;
}

@Injectable()
export class CharactersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CharacterEntity)
    private readonly characterRepository: Repository<CharacterEntity>,
    @InjectRepository(ClassEntity)
    private readonly classRepository: Repository<ClassEntity>,
    @InjectRepository(RaceEntity)
    private readonly raceRepository: Repository<RaceEntity>,
    @InjectRepository(SubraceEntity)
    private readonly subraceRepository: Repository<SubraceEntity>,
    @InjectRepository(BackgroundEntity)
    private readonly backgroundRepository: Repository<BackgroundEntity>,
    @InjectRepository(AlignmentEntity)
    private readonly alignmentRepository: Repository<AlignmentEntity>,
    @InjectRepository(AbilityScoreEntity)
    private readonly abilityScoreRepository: Repository<AbilityScoreEntity>,
    @InjectRepository(SkillEntity)
    private readonly skillRepository: Repository<SkillEntity>,
    @InjectRepository(ProficiencyEntity)
    private readonly proficiencyRepository: Repository<ProficiencyEntity>,
    @InjectRepository(SpellEntity)
    private readonly spellRepository: Repository<SpellEntity>,
    @InjectRepository(EquipmentEntity)
    private readonly equipmentRepository: Repository<EquipmentEntity>,
    @InjectRepository(ClassStartingEquipmentEntity)
    private readonly classStartingEquipRepo: Repository<ClassStartingEquipmentEntity>,
    @InjectRepository(LevelEntity)
    private readonly levelRepository: Repository<LevelEntity>,
    @InjectRepository(CompSourceEntity)
    private readonly compSourceRepository: Repository<CompSourceEntity>,
  ) {}

  async listByUser(userId: string): Promise<CharacterEntity[]> {
    // Sub-relations (class, subclass, race, etc.) use eager:true on their entities
    // so only first-level relations need to be specified
    return this.characterRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: [
        'character_classes',
        'character_origin',
        'character_ability_scores',
        'character_skills',
      ],
    });
  }

  async getById(userId: string, id: string): Promise<CharacterEntity> {
    const character = await this.characterRepository.findOne({
      where: { id, userId },
    });
    if (!character) {
      throw new NotFoundException('Personagem nao encontrado.');
    }
    return character;
  }

  async create(input: CreateCharacterInput): Promise<CharacterEntity> {
    if (!input.name?.trim()) {
      throw new BadRequestException('Nome do personagem e obrigatorio.');
    }

    // Normaliza input: aceita abilityScores e equipment choices em data ou choices.
    // Quando ambos presentes, choices vence (shape canônico interno).
    const rawData = (input.data ?? {}) as Record<string, unknown>;
    const rawChoices = (input.choices ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...rawData, ...rawChoices };
    const normalizedAbilities = normalizeAbilityScores(
      (rawChoices.abilityScores as Record<string, unknown>) ??
        (rawData.abilityScores as Record<string, unknown>),
    );
    if (normalizedAbilities) {
      merged.abilityScores = normalizedAbilities;
    }
    const choices = merged as unknown as CharacterChoicesData;

    // Validação dura: ability scores são obrigatórios e completos (6 abilities).
    if (!choices.abilityScores) {
      throw new BadRequestException({
        ok: false,
        code: 'MISSING_ABILITY_SCORES',
        error: 'Pontuações de habilidade são obrigatórias.',
        expectedShape: {
          str: 'integer 1-30',
          dex: 'integer 1-30',
          con: 'integer 1-30',
          int: 'integer 1-30',
          wis: 'integer 1-30',
          cha: 'integer 1-30',
        },
      });
    }
    const missingAbilities = ABILITY_SLUGS.filter(
      (slug) => !(slug in choices.abilityScores!),
    );
    if (missingAbilities.length > 0) {
      throw new BadRequestException({
        ok: false,
        code: 'INCOMPLETE_ABILITY_SCORES',
        error: `Pontuações de habilidade incompletas: faltam ${missingAbilities.join(', ')}.`,
        missing: missingAbilities,
      });
    }

    // Validação: equipment choices obrigatórias quando a classe oferece opções.
    const classSlugForOptions = choices.classSlug;
    if (classSlugForOptions) {
      const classForOptions = await this.classRepository.findOneBy({
        slug: classSlugForOptions,
      });
      const hasOptions = hasStartingEquipmentOptions(
        classForOptions?.starting_equipment_options,
      );
      const providedChoices = choices.classEquipmentChoices;
      const noChoicesProvided =
        !providedChoices ||
        (Array.isArray(providedChoices) && providedChoices.length === 0);
      if (hasOptions && noChoicesProvided && !choices.classStartingGold) {
        throw new BadRequestException({
          ok: false,
          code: 'MISSING_CLASS_EQUIPMENT_CHOICES',
          error:
            'Esta classe oferece opções de equipamento inicial. Selecione uma ou envie classStartingGold.',
          classSlug: classSlugForOptions,
        });
      }
    }

    return this.dataSource.transaction(async (manager) => {
      // Resolve source
      const sourceEntity = choices.sourceCode
        ? await this.compSourceRepository.findOneBy({
            code: choices.sourceCode,
          })
        : null;

      // Create character record (keep data as backup)
      const character = manager.create(CharacterEntity, {
        userId: input.userId,
        name: input.name.trim(),
        data: input.data,
        sourceId: sourceEntity?.id ?? undefined,
      });
      const saved = await manager.save(CharacterEntity, character);
      const charId = saved.id;

      // Resolve slugs
      const classEntity = choices.classSlug
        ? await this.classRepository.findOneBy({ slug: choices.classSlug })
        : null;
      const raceEntity = choices.raceSlug
        ? await this.raceRepository.findOneBy({ slug: choices.raceSlug })
        : null;
      const subraceEntity = choices.subraceSlug
        ? await this.subraceRepository.findOneBy({ slug: choices.subraceSlug })
        : null;
      const backgroundEntity = choices.backgroundSlug
        ? await this.backgroundRepository.findOneBy({
            slug: choices.backgroundSlug,
          })
        : null;
      const alignmentEntity = choices.alignmentSlug
        ? await this.alignmentRepository.findOneBy({
            slug: choices.alignmentSlug,
          })
        : null;

      if (!classEntity || !raceEntity || !backgroundEntity) {
        throw new BadRequestException(
          `Dados obrigatorios nao encontrados: ${[
            !classEntity && 'classe',
            !raceEntity && 'raca',
            !backgroundEntity && 'passado',
          ]
            .filter(Boolean)
            .join(', ')}.`,
        );
      }

      // character_classes
      await manager.save(CharacterClassEntity, {
        character_id: charId,
        class_id: classEntity.id,
        class_level: 1,
        order: 1,
      });

      // character_ability_scores
      const bgBonuses = choices.backgroundAbilityBonuses ?? [];
      // Em edições onde o background NÃO dá bonuses (PHB 2014), aplica
      // automaticamente os bonuses raciais (RAW: Hill Dwarf CON +2, etc.).
      // Em XPHB 2024 os bonuses vêm do background via choices.backgroundAbilityBonuses.
      const editionGrantsBgBonuses =
        sourceEntity?.rules?.backgroundGrantsAbilityBonuses === true;
      const raceBonusMap: Record<string, number> = {};
      if (!editionGrantsBgBonuses) {
        const raceBonuses =
          (raceEntity as unknown as {
            ability_bonuses?: Array<{
              ability_score?: { slug?: string };
              bonus?: number;
            }>;
          }).ability_bonuses ?? [];
        for (const rb of raceBonuses) {
          const slug = rb.ability_score?.slug;
          if (slug && typeof rb.bonus === 'number') {
            raceBonusMap[slug] = (raceBonusMap[slug] ?? 0) + rb.bonus;
          }
        }
      }
      if (choices.abilityScores) {
        for (const [key, value] of Object.entries(choices.abilityScores)) {
          const slug = SLUG_MAP[key];
          if (!slug) continue;
          const asEntity = await this.abilityScoreRepository.findOneBy({
            slug,
          });
          if (!asEntity) continue;
          const bgBonus =
            bgBonuses.find((b) => b.abilityScoreIndex === slug)?.bonus ?? 0;
          const raceBonus = raceBonusMap[slug] ?? 0;
          await manager.save(CharacterAbilityScoreEntity, {
            character_id: charId,
            ability_score_id: asEntity.id,
            base_score: value,
            bonus: bgBonus + raceBonus,
          });
        }
      }

      // character_skills
      const skillSlugs = choices.skills ?? [];
      const expertiseSlugs = new Set(choices.expertiseSkills ?? []);
      for (const slug of skillSlugs) {
        const skillEntity = await this.skillRepository.findOneBy({ slug });
        if (!skillEntity) continue;
        await manager.save(CharacterSkillEntity, {
          character_id: charId,
          skill_id: skillEntity.id,
          expertise: expertiseSlugs.has(slug),
        });
      }
      // expertise not in main skills
      for (const slug of expertiseSlugs) {
        if (skillSlugs.includes(slug)) continue;
        const skillEntity = await this.skillRepository.findOneBy({ slug });
        if (!skillEntity) continue;
        await manager.save(CharacterSkillEntity, {
          character_id: charId,
          skill_id: skillEntity.id,
          expertise: true,
        });
      }

      // character_proficiencies
      const raceProfSlugs = choices.raceProficiencyChoices ?? [];
      const bgProfSlugs = choices.backgroundProficiencyChoices ?? [];
      for (const slug of raceProfSlugs) {
        const profEntity = await this.proficiencyRepository.findOneBy({ slug });
        if (!profEntity) continue;
        await manager.save(CharacterProficiencyEntity, {
          character_id: charId,
          proficiency_id: profEntity.id,
          source: CharacterProficiencySourceEnum.Race,
        });
      }
      for (const slug of bgProfSlugs) {
        const profEntity = await this.proficiencyRepository.findOneBy({ slug });
        if (!profEntity) continue;
        await manager.save(CharacterProficiencyEntity, {
          character_id: charId,
          proficiency_id: profEntity.id,
          source: CharacterProficiencySourceEnum.Background,
        });
      }

      // character_spells (deduplicate: prepared takes precedence over spellbook)
      const cantripSlugs = choices.classCantrips ?? [];
      const preparedSlugs = choices.classPreparedSpells ?? [];
      const spellbookSlugs = choices.classSpellbook ?? [];
      const raceSpellSlugs = choices.raceSpellChoices ?? [];
      const savedSpellSlugs = new Set<string>();

      for (const slug of cantripSlugs) {
        if (savedSpellSlugs.has(slug)) continue;
        const spellEntity = await this.spellRepository.findOneBy({ slug });
        if (!spellEntity) continue;
        savedSpellSlugs.add(slug);
        await manager.save(CharacterSpellEntity, {
          character_id: charId,
          spell_id: spellEntity.id,
          source: SpellSourceEnum.Class,
          status: SpellStatusEnum.Known,
          always_prepared: true,
        });
      }
      for (const slug of preparedSlugs) {
        if (savedSpellSlugs.has(slug)) continue;
        const spellEntity = await this.spellRepository.findOneBy({ slug });
        if (!spellEntity) continue;
        savedSpellSlugs.add(slug);
        await manager.save(CharacterSpellEntity, {
          character_id: charId,
          spell_id: spellEntity.id,
          source: SpellSourceEnum.Class,
          status: SpellStatusEnum.Prepared,
          always_prepared: false,
        });
      }
      for (const slug of spellbookSlugs) {
        if (savedSpellSlugs.has(slug)) continue;
        const spellEntity = await this.spellRepository.findOneBy({ slug });
        if (!spellEntity) continue;
        savedSpellSlugs.add(slug);
        await manager.save(CharacterSpellEntity, {
          character_id: charId,
          spell_id: spellEntity.id,
          source: SpellSourceEnum.Class,
          status: SpellStatusEnum.Spellbook,
          always_prepared: false,
        });
      }
      for (const slug of raceSpellSlugs) {
        const spellEntity = await this.spellRepository.findOneBy({ slug });
        if (!spellEntity) continue;
        await manager.save(CharacterSpellEntity, {
          character_id: charId,
          spell_id: spellEntity.id,
          source: SpellSourceEnum.Race,
          status: SpellStatusEnum.Known,
          always_prepared: true,
        });
      }

      // character_state
      const conScore = choices.abilityScores?.con ?? 10;
      const conBonus =
        bgBonuses.find((b) => b.abilityScoreIndex === 'con')?.bonus ?? 0;
      const conMod = getAbilityModifier(conScore + conBonus);
      const startHp = classEntity.hit_die + conMod;
      const gp =
        (choices.classStartingGold as { amount?: number } | undefined)
          ?.amount ?? 0;

      await manager.save(CharacterStateEntity, {
        character_id: charId,
        current_hp: startHp,
        gp,
      });

      // character_equipment (materialize starting items)
      if (!choices.classStartingGold) {
        await this.materializeEquipment(
          manager,
          charId,
          classEntity.id,
          choices.classEquipmentChoices ?? [],
          choices.backgroundEquipmentChoices ?? [],
        );
      }

      // character_origin
      await manager.save(CharacterOriginEntity, {
        character_id: charId,
        race_id: raceEntity.id,
        subrace_id: subraceEntity?.id ?? undefined,
        background_id: backgroundEntity.id,
        alignment_id: alignmentEntity?.id ?? undefined,
        personality: choices.personality ?? {},
        species_size: choices.speciesSize,
        species_spellcasting_ability: choices.speciesSpellcastingAbility,
        age: choices.age,
        height: choices.height,
        weight: choices.weight,
        ability_score_method: choices.abilityScoreMethod,
        race_trait_choices: choices.raceTraitChoices ?? [],
        race_feat_choice: choices.raceFeatChoiceSlug,
        divine_order: choices.divineOrder,
        primal_order: choices.primalOrder,
        fighting_style_index: choices.fightingStyleSlug,
        class_equipment_choices: choices.classEquipmentChoices ?? [],
        background_equipment_choices: choices.backgroundEquipmentChoices ?? [],
        class_starting_gold: choices.classStartingGold ?? undefined,
        eldritch_invocations: choices.eldritchInvocations ?? [],
        eldritch_invocation_sub_choices:
          choices.eldritchInvocationSubChoices ?? undefined,
        weapon_mastery_choices: choices.weaponMasteryChoices ?? [],
        class_language_choices: choices.classLanguageChoices ?? [],
        class_tool_proficiency: choices.classToolProficiency,
      });

      // character_features (level 1)
      const levelData = await this.levelRepository.findOne({
        where: {
          class_id: classEntity.id,
          level: 1,
          subclass_id: IsNull(),
        },
        relations: ['level_features', 'level_features.feature'],
      });

      if (levelData?.level_features) {
        for (const lf of levelData.level_features) {
          await manager.save(CharacterFeatureEntity, {
            character_id: charId,
            feature_id: lf.feature.id,
            source_class_id: classEntity.id,
            active: true,
            choices: {},
          });
        }
      }

      return saved;
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCharacterInput,
  ): Promise<CharacterEntity> {
    const character = await this.getById(userId, id);
    if (input.name !== undefined) {
      character.name = input.name.trim();
    }
    return this.characterRepository.save(character);
  }

  async remove(userId: string, id: string): Promise<void> {
    const character = await this.getById(userId, id);
    await this.characterRepository.remove(character);
  }

  /**
   * Parse formatted equipment label strings (e.g. "1x Longsword", "8 gp")
   * and create CharacterEquipmentEntity records + apply gold from equipment choices.
   */
  private async materializeEquipment(
    manager: import('typeorm').EntityManager,
    characterId: string,
    classId: string,
    classChoiceLabels: string[],
    backgroundChoiceLabels: string[],
  ): Promise<void> {
    // 1. Class fixed starting equipment
    const classStarting = await this.classStartingEquipRepo.find({
      where: { class_id: classId },
    });

    const seenEquipIds = new Set<string>();
    // Auto-equip o primeiro item de cada slot (armor, shield, weapon) que chegar.
    // Resolve o critério de aceite do spec 001: Fighter L1 com chain mail + longsword + shield → AC 18.
    const equippedSlots = new Set<'armor' | 'shield' | 'weapon'>();
    const shouldEquip = (eq: EquipmentLite | undefined): boolean => {
      if (!eq) return false;
      const slot = decideEquipSlot(eq);
      if (!slot || equippedSlots.has(slot)) return false;
      equippedSlots.add(slot);
      return true;
    };

    for (const cse of classStarting) {
      seenEquipIds.add(cse.equipment_id);
      const eq = (
        cse as unknown as { equipment?: EquipmentLite }
      ).equipment;
      await manager.save(CharacterEquipmentEntity, {
        character_id: characterId,
        equipment_id: cse.equipment_id,
        quantity: 1,
        equipped: shouldEquip(eq),
        source: EquipmentSourceEnum.Starting,
      });
    }

    // 2. Parse choice labels into { name, quantity } pairs + gold
    const allLabels = [...classChoiceLabels, ...backgroundChoiceLabels];

    let extraGold = 0;
    const parsedItems: Array<{ name: string; quantity: number }> = [];

    for (const label of allLabels) {
      // Each label may contain multiple items separated by ", "
      // e.g. "1x Calligrapher's Supplies, 1x Book, 10x Parchment, 8 gp"
      const parts = label.split(/,\s*/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Match gold: "8 gp", "10 sp", etc.
        const goldMatch = trimmed.match(/^(\d+)\s*(gp|sp|cp|pp)$/i);
        if (goldMatch) {
          const amount = parseInt(goldMatch[1], 10);
          const unit = goldMatch[2].toLowerCase();
          if (unit === 'gp') extraGold += amount;
          else if (unit === 'sp') extraGold += amount / 10;
          else if (unit === 'cp') extraGold += amount / 100;
          else if (unit === 'pp') extraGold += amount * 10;
          continue;
        }

        // Match item: "1x Longsword", "10x Parchment"
        const itemMatch = trimmed.match(/^(\d+)x\s+(.+)$/i);
        if (itemMatch) {
          parsedItems.push({
            quantity: parseInt(itemMatch[1], 10),
            name: itemMatch[2].trim(),
          });
          continue;
        }

        // Match category choice: "2x (Simple Weapons)" — skip, can't resolve a category to one item
        if (trimmed.match(/^\d+x\s+\(.+\)$/)) continue;

        // Fallback: treat the whole string as an item name
        parsedItems.push({ quantity: 1, name: trimmed });
      }
    }

    // 3. Resolve names to equipment entities and create records
    if (parsedItems.length > 0) {
      const allEquipment = await this.equipmentRepository.find();
      const nameMap = new Map<string, (typeof allEquipment)[0]>();
      for (const eq of allEquipment) {
        nameMap.set(eq.name.toLowerCase(), eq);
        nameMap.set(eq.slug.toLowerCase(), eq);
      }

      for (const { name, quantity } of parsedItems) {
        const eq = nameMap.get(name.toLowerCase());
        if (!eq) continue;
        if (seenEquipIds.has(eq.id)) {
          // Already added as fixed starting equipment — increase quantity
          await manager
            .createQueryBuilder()
            .update(CharacterEquipmentEntity)
            .set({ quantity: () => `quantity + :addQty` })
            .where(
              'character_id = :characterId AND equipment_id = :equipmentId',
              {
                characterId,
                equipmentId: eq.id,
                addQty: quantity,
              },
            )
            .execute();
          continue;
        }
        seenEquipIds.add(eq.id);
        await manager.save(CharacterEquipmentEntity, {
          character_id: characterId,
          equipment_id: eq.id,
          quantity,
          equipped: shouldEquip(eq as unknown as EquipmentLite),
          source: EquipmentSourceEnum.Starting,
        });
      }
    }

    // 4. Apply extra gold from equipment choices
    if (extraGold > 0) {
      await manager
        .createQueryBuilder()
        .update('character_state')
        .set({ gp: () => `gp + :addGold` })
        .where('character_id = :characterId', { characterId, addGold: Math.floor(extraGold) })
        .execute();
    }
  }
}
