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

function extractEquipmentOptionLabels(
  raw: Record<string, unknown> | null | undefined,
): string[] {
  // Extrai apenas labels textuais (shape { default: [strings] } ou
  // { options: [{ label/name }] }). Shape XPHB usa { defaultData: [{A: [items], B: [...]}] }
  // que NÃO expõe labels textuais — nesse caso retornamos [] e pulamos validação
  // de conteúdo (materializeEquipment faz matching permissivo).
  if (!raw) return [];
  const candidates: unknown[] = [];
  const push = (v: unknown) => {
    if (Array.isArray(v)) candidates.push(...v);
  };
  push((raw as { default?: unknown }).default);
  push((raw as { options?: unknown }).options);
  if (Array.isArray(raw as unknown as unknown[])) {
    push(raw as unknown as unknown[]);
  }
  return candidates
    .map((c) => {
      if (typeof c === 'string') return c;
      if (c && typeof c === 'object') {
        const obj = c as { label?: unknown; name?: unknown };
        if (typeof obj.label === 'string') return obj.label;
        if (typeof obj.name === 'string') return obj.name;
      }
      return null;
    })
    .filter((s): s is string => s !== null && s.length > 0);
}

function hasStartingEquipmentOptions(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  if (!raw) return false;
  // Textuais
  if (extractEquipmentOptionLabels(raw).length > 0) return true;
  // Shape XPHB { defaultData: [{ A: [...], B: [...] }, ...] }
  const defaultData = (raw as { defaultData?: unknown }).defaultData;
  if (Array.isArray(defaultData)) {
    for (const group of defaultData) {
      if (group && typeof group === 'object' && Object.keys(group).length > 0) {
        return true;
      }
    }
  }
  // Objeto não-vazio em top-level (shape background { A: [...], B: [...] })
  if (!Array.isArray(raw) && Object.keys(raw).length > 0) {
    const keys = Object.keys(raw).filter(
      (k) => !['additionalFromBackground', 'goldAlternative'].includes(k),
    );
    for (const k of keys) {
      const v = (raw as Record<string, unknown>)[k];
      if (v && (Array.isArray(v) || typeof v === 'object')) return true;
    }
  }
  return false;
}

function validateEquipmentChoices(
  providedChoices: string[] | undefined,
  validLabels: string[],
): string[] {
  if (!providedChoices || providedChoices.length === 0) return [];
  // Sem catálogo de opções: não há o que validar (classe/background livre).
  if (validLabels.length === 0) return [];
  const validSet = new Set(validLabels.map((l) => l.toLowerCase().trim()));
  return providedChoices.filter(
    (c) => !validSet.has(String(c).toLowerCase().trim()),
  );
}

// ─── Spec 008: XPHB letter-based equipment packages ───

const IGNORED_OPTION_KEYS = new Set([
  'additionalFromBackground',
  'goldAlternative',
  'default',
  'defaultData',
]);

type LetterGroup = { letters: string[]; items: Record<string, unknown[]> };
type LetterOptions =
  | { type: 'letters'; groups: LetterGroup[] }
  | { type: 'labels'; labels: string[] }
  | { type: 'none' };

function extractLetterOptions(
  raw: Record<string, unknown> | null | undefined,
): LetterOptions {
  if (!raw) return { type: 'none' };

  // Shape XPHB classe: { defaultData: [{ A: [...], B: [...] }, ...] }
  const defaultData = (raw as { defaultData?: unknown }).defaultData;
  if (Array.isArray(defaultData) && defaultData.length > 0) {
    const groups: LetterGroup[] = [];
    for (const group of defaultData) {
      if (group && typeof group === 'object' && !Array.isArray(group)) {
        const letters = Object.keys(group).filter((k) => /^[A-Z]$/.test(k));
        if (letters.length > 0) {
          groups.push({
            letters: letters.sort(),
            items: group as Record<string, unknown[]>,
          });
        }
      }
    }
    if (groups.length > 0) return { type: 'letters', groups };
  }

  // Shape XPHB background: top-level keys são letras { A: [...], B: [...] }
  const topKeys = Object.keys(raw).filter((k) => !IGNORED_OPTION_KEYS.has(k));
  const letterKeys = topKeys.filter((k) => /^[A-Z]$/.test(k));
  if (letterKeys.length > 0 && letterKeys.length === topKeys.length) {
    const items: Record<string, unknown[]> = {};
    for (const k of letterKeys) {
      items[k] = Array.isArray(raw[k]) ? (raw[k] as unknown[]) : [];
    }
    return {
      type: 'letters',
      groups: [{ letters: letterKeys.sort(), items }],
    };
  }

  // Fallback: labels textuais
  const labels = extractEquipmentOptionLabels(raw);
  if (labels.length > 0) return { type: 'labels', labels };

  return { type: 'none' };
}

function isLetterChoice(s: string): boolean {
  return /^[A-Z]$/.test(s);
}

function validateLetterChoicesOrThrow(
  providedChoices: string[] | undefined,
  optionInfo: LetterOptions,
  errorCode: string,
  slug: string,
): void {
  if (optionInfo.type !== 'letters') return;
  const { groups } = optionInfo;

  if (!providedChoices || providedChoices.length === 0) return;

  // Filtrar apenas as letras (ignorar labels legacy misturadas)
  const letters = providedChoices.filter(isLetterChoice);
  if (letters.length === 0) return;

  // Verificar contagem: uma letra por grupo
  if (letters.length !== groups.length) {
    const missingCode = errorCode
      .replace('INVALID_', 'MISSING_')
      .replace(/_CHOICE$/, '_CHOICES');
    throw new BadRequestException({
      ok: false,
      code: missingCode,
      error: `${slug} requer ${groups.length} escolha(s) de equipamento (uma por grupo), recebido ${letters.length}.`,
      validOptions: groups.map((g) => g.letters),
    });
  }

  // Verificar cada letra contra o grupo correspondente
  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    const group = groups[i];
    if (!group.letters.includes(letter)) {
      throw new BadRequestException({
        ok: false,
        code: errorCode,
        error: `Escolha '${letter}' não é válida para o grupo ${i + 1} de ${slug}.`,
        invalidChoices: [letter],
        validOptions: group.letters,
      });
    }
  }
}

type ResolvedItem =
  | { slug: string; name: string; quantity: number }
  | { gold: number; unit: string };

function resolveLetterPackageItems(
  raw: Record<string, unknown> | null | undefined,
  letters: string[],
): ResolvedItem[] {
  if (!raw || letters.length === 0) return [];
  const optionInfo = extractLetterOptions(raw);
  if (optionInfo.type !== 'letters') return [];

  const results: ResolvedItem[] = [];
  const { groups } = optionInfo;

  for (let i = 0; i < letters.length && i < groups.length; i++) {
    const group = groups[i];
    const items = group.items[letters[i]];
    if (!Array.isArray(items)) continue;
    expandItems(items, results);
  }

  return results;
}

function expandItems(items: unknown[], results: ResolvedItem[]): void {
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    // SRD class shape: { option_type: 'counted_reference', count, of: { index, name } }
    if (obj.option_type === 'counted_reference' && obj.of) {
      const of = obj.of as { index?: string; name?: string };
      if (of.index || of.name) {
        results.push({
          slug: String(of.index ?? of.name).toLowerCase(),
          name: String(of.name ?? of.index),
          quantity: typeof obj.count === 'number' ? obj.count : 1,
        });
      }
      continue;
    }

    // SRD class shape: { option_type: 'money', count, unit }
    if (obj.option_type === 'money' && typeof obj.count === 'number') {
      results.push({
        gold: obj.count,
        unit: typeof obj.unit === 'string' ? obj.unit : 'gp',
      });
      continue;
    }

    // SRD class shape: { option_type: 'multiple', items: [...] }
    if (obj.option_type === 'multiple' && Array.isArray(obj.items)) {
      expandItems(obj.items as unknown[], results);
      continue;
    }

    // Background shape: { gold: N }
    if (typeof obj.gold === 'number') {
      results.push({ gold: obj.gold, unit: 'gp' });
      continue;
    }

    // Background shape: { name, quantity }
    if (typeof obj.name === 'string') {
      const name = obj.name;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      results.push({
        slug,
        name,
        quantity: typeof obj.quantity === 'number' ? obj.quantity : 1,
      });
      continue;
    }
  }
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

    // Validação: equipment choices contra as opções do SRD (classe + background).
    // Spec 008: detecta shape (letters vs labels) e valida de acordo.
    let classRawOptions: Record<string, unknown> | null | undefined;
    let bgRawOptions: Record<string, unknown> | null | undefined;

    const classSlugForOptions = choices.classSlug;
    if (classSlugForOptions) {
      const classForOptions = await this.classRepository.findOneBy({
        slug: classSlugForOptions,
      });
      classRawOptions = classForOptions?.starting_equipment_options;
      const classOptionInfo = extractLetterOptions(classRawOptions);
      const classHasOptions = hasStartingEquipmentOptions(classRawOptions);
      const providedClassChoices = choices.classEquipmentChoices;
      const noClassChoicesProvided =
        !providedClassChoices ||
        (Array.isArray(providedClassChoices) &&
          providedClassChoices.length === 0);
      if (
        classHasOptions &&
        noClassChoicesProvided &&
        !choices.classStartingGold
      ) {
        const validOptions =
          classOptionInfo.type === 'letters'
            ? classOptionInfo.groups.flatMap((g) => g.letters)
            : classOptionInfo.type === 'labels'
              ? classOptionInfo.labels
              : [];
        throw new BadRequestException({
          ok: false,
          code: 'MISSING_CLASS_EQUIPMENT_CHOICES',
          error:
            'Esta classe oferece opções de equipamento inicial. Selecione uma ou envie classStartingGold.',
          classSlug: classSlugForOptions,
          validOptions,
        });
      }

      if (classOptionInfo.type === 'letters') {
        validateLetterChoicesOrThrow(
          providedClassChoices,
          classOptionInfo,
          'INVALID_CLASS_EQUIPMENT_CHOICE',
          classSlugForOptions,
        );
      } else {
        const classOptionLabels =
          classOptionInfo.type === 'labels' ? classOptionInfo.labels : [];
        const invalidClassChoices = validateEquipmentChoices(
          providedClassChoices,
          classOptionLabels,
        );
        if (invalidClassChoices.length > 0) {
          throw new BadRequestException({
            ok: false,
            code: 'INVALID_CLASS_EQUIPMENT_CHOICE',
            error: `Opções inválidas para ${classSlugForOptions}: ${invalidClassChoices.join(', ')}.`,
            invalidChoices: invalidClassChoices,
            validOptions: classOptionLabels,
          });
        }
      }
    }

    const bgSlugForOptions = choices.backgroundSlug;
    if (bgSlugForOptions) {
      const bgForOptions = await this.backgroundRepository.findOneBy({
        slug: bgSlugForOptions,
      });
      bgRawOptions = bgForOptions?.equipment_options;
      const bgOptionInfo = extractLetterOptions(bgRawOptions);
      const bgHasOptions = hasStartingEquipmentOptions(bgRawOptions);
      const providedBgChoices = choices.backgroundEquipmentChoices;
      const noBgChoicesProvided =
        !providedBgChoices ||
        (Array.isArray(providedBgChoices) && providedBgChoices.length === 0);
      if (bgHasOptions && noBgChoicesProvided) {
        const validOptions =
          bgOptionInfo.type === 'letters'
            ? bgOptionInfo.groups.flatMap((g) => g.letters)
            : bgOptionInfo.type === 'labels'
              ? bgOptionInfo.labels
              : [];
        throw new BadRequestException({
          ok: false,
          code: 'MISSING_BACKGROUND_EQUIPMENT_CHOICES',
          error:
            'Este background oferece opções de equipamento inicial. Selecione uma.',
          backgroundSlug: bgSlugForOptions,
          validOptions,
        });
      }

      if (bgOptionInfo.type === 'letters') {
        validateLetterChoicesOrThrow(
          providedBgChoices,
          bgOptionInfo,
          'INVALID_BACKGROUND_EQUIPMENT_CHOICE',
          bgSlugForOptions,
        );
      } else {
        const bgOptionLabels =
          bgOptionInfo.type === 'labels' ? bgOptionInfo.labels : [];
        const invalidBgChoices = validateEquipmentChoices(
          providedBgChoices,
          bgOptionLabels,
        );
        if (invalidBgChoices.length > 0) {
          throw new BadRequestException({
            ok: false,
            code: 'INVALID_BACKGROUND_EQUIPMENT_CHOICE',
            error: `Opções inválidas para background ${bgSlugForOptions}: ${invalidBgChoices.join(', ')}.`,
            invalidChoices: invalidBgChoices,
            validOptions: bgOptionLabels,
          });
        }
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
          classRawOptions,
          bgRawOptions,
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
   * Parse formatted equipment label strings (e.g. "1x Longsword", "8 gp") or resolve
   * XPHB letter-based packages (e.g. "A", "B") into CharacterEquipmentEntity records.
   * Spec 008: letter choices resolve against defaultData/equipment_options JSONB.
   */
  private async materializeEquipment(
    manager: import('typeorm').EntityManager,
    characterId: string,
    classId: string,
    classChoiceLabels: string[],
    backgroundChoiceLabels: string[],
    classRawOptions?: Record<string, unknown> | null,
    bgRawOptions?: Record<string, unknown> | null,
  ): Promise<void> {
    // 1. Class fixed starting equipment
    const classStarting = await this.classStartingEquipRepo.find({
      where: { class_id: classId },
    });

    const seenEquipIds = new Set<string>();
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

    // 2. Separate letter choices from legacy label choices
    const classLetters = classChoiceLabels.filter(isLetterChoice);
    const classLegacy = classChoiceLabels.filter((s) => !isLetterChoice(s));
    const bgLetters = backgroundChoiceLabels.filter(isLetterChoice);
    const bgLegacy = backgroundChoiceLabels.filter((s) => !isLetterChoice(s));

    let extraGold = 0;
    const parsedItems: Array<{ name: string; quantity: number }> = [];

    // 2a. Resolve letter-based packages (Spec 008)
    const letterResolved = [
      ...resolveLetterPackageItems(classRawOptions, classLetters),
      ...resolveLetterPackageItems(bgRawOptions, bgLetters),
    ];
    for (const item of letterResolved) {
      if ('gold' in item) {
        const unit = item.unit.toLowerCase();
        if (unit === 'gp') extraGold += item.gold;
        else if (unit === 'sp') extraGold += item.gold / 10;
        else if (unit === 'cp') extraGold += item.gold / 100;
        else if (unit === 'pp') extraGold += item.gold * 10;
      } else {
        parsedItems.push({ name: item.slug, quantity: item.quantity });
      }
    }

    // 2b. Parse legacy label strings
    const allLabels = [...classLegacy, ...bgLegacy];
    for (const label of allLabels) {
      const parts = label.split(/,\s*/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

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

        const itemMatch = trimmed.match(/^(\d+)x\s+(.+)$/i);
        if (itemMatch) {
          parsedItems.push({
            quantity: parseInt(itemMatch[1], 10),
            name: itemMatch[2].trim(),
          });
          continue;
        }

        if (trimmed.match(/^\d+x\s+\(.+\)$/)) continue;

        parsedItems.push({ quantity: 1, name: trimmed });
      }
    }

    // 3. Resolve names/slugs to equipment entities and create records
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
