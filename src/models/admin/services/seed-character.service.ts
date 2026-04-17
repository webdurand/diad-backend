import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserEntity,
  CharacterEntity,
  ClassEntity,
  SubclassEntity,
} from 'src/entities';
import { CharactersService } from '../../characters/services/characters.service';
import { CharacterSheetService } from '../../characters/services/character-sheet.service';
import {
  SeedCharacterDto,
  SupportedClassSlug,
} from '../dto/seed-character.dto';

export interface SeedCharacterResult {
  id: string;
  name: string;
  sheetSummary: {
    level: number;
    hpMax: number;
    armorClass: number;
    proficiencyBonus: number;
    spellSlots?: number[];
  };
}

/**
 * Ability primária por classe (ordem STR, DEX, CON, INT, WIS, CHA).
 * Usado pra alocar standard array [15,14,13,12,10,8] quando `abilityArray` não vem.
 */
const PRIMARY_ABILITY_INDEX: Record<SupportedClassSlug, number> = {
  barbarian: 0, // STR
  bard: 5, // CHA
  cleric: 4, // WIS
  druid: 4, // WIS
  fighter: 0, // STR
  monk: 1, // DEX (+ WIS secundário)
  paladin: 0, // STR (+ CHA)
  ranger: 1, // DEX (+ WIS)
  rogue: 1, // DEX
  sorcerer: 5, // CHA
  warlock: 5, // CHA
  wizard: 3, // INT
};

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const E2E_DEFAULT_USER_EMAIL = 'e2e-harness@diad.local';

@Injectable()
export class SeedCharacterService {
  private readonly logger = new Logger(SeedCharacterService.name);

  constructor(
    private readonly charactersService: CharactersService,
    private readonly characterSheetService: CharacterSheetService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(ClassEntity)
    private readonly classRepo: Repository<ClassEntity>,
    @InjectRepository(SubclassEntity)
    private readonly subclassRepo: Repository<SubclassEntity>,
  ) {}

  async seed(dto: SeedCharacterDto): Promise<SeedCharacterResult> {
    const classEntity = await this.resolveClass(dto.classSlug);
    await this.resolveSubclass(dto.subclassSlug, classEntity.id);
    const ownerUserId = await this.resolveOwner(dto.ownerUserId);
    const abilityScores = this.buildAbilityScores(dto);
    const name = dto.name ?? `${dto.classSlug}-L${dto.level}-e2e`;

    await this.ensureNameUnique(ownerUserId, name);

    const character = await this.createLevel1Character({
      ownerUserId,
      name,
      classSlug: dto.classSlug,
      abilityScores,
    });

    if (dto.level > 1) {
      // Harness L10/L20 exige level-up determinístico com escolhas de ASI/feat/spells/subclass.
      // Deixado pra próxima iteração da spec 012 — endpoint retorna 501 enquanto isso.
      throw new NotImplementedException({
        code: 'LEVEL_UP_NOT_YET_IMPLEMENTED',
        message: `Seed L${dto.level} ainda não implementado. PC L1 criado (id=${character.id}); próxima iteração da spec 012 adiciona level-up determinístico.`,
        characterId: character.id,
        level: 1,
      });
    }

    const summary = await this.buildSheetSummary(ownerUserId, character.id);

    this.logger.log(
      `Seed OK: ${name} (${dto.classSlug}, L${dto.level}, owner=${ownerUserId})`,
    );

    return {
      id: character.id,
      name: character.name,
      sheetSummary: summary,
    };
  }

  private async resolveClass(slug: SupportedClassSlug): Promise<ClassEntity> {
    const entity = await this.classRepo.findOneBy({ slug });
    if (!entity) {
      throw new BadRequestException({
        code: 'INVALID_CLASS',
        field: 'classSlug',
        message: `Classe "${slug}" não encontrada em comp_sources. Rode /admin/seed-all antes.`,
      });
    }
    return entity;
  }

  private async resolveSubclass(
    slug: string,
    classId: string,
  ): Promise<SubclassEntity | null> {
    const entity = await this.subclassRepo.findOneBy({ slug });
    if (!entity) {
      throw new BadRequestException({
        code: 'INVALID_SUBCLASS',
        field: 'subclassSlug',
        message: `Subclasse "${slug}" não encontrada.`,
      });
    }
    if (entity.class_id !== classId) {
      throw new BadRequestException({
        code: 'INVALID_SUBCLASS',
        field: 'subclassSlug',
        message: `Subclasse "${slug}" não pertence à classe informada.`,
      });
    }
    return entity;
  }

  private async resolveOwner(explicitId: string | undefined): Promise<string> {
    if (explicitId) {
      const user = await this.userRepo.findOneBy({ id: explicitId });
      if (!user) {
        throw new NotFoundException({
          code: 'OWNER_USER_NOT_FOUND',
          field: 'ownerUserId',
          message: `Usuário ${explicitId} não encontrado.`,
        });
      }
      return user.id;
    }

    const e2eUser = await this.userRepo.findOneBy({
      email: E2E_DEFAULT_USER_EMAIL,
    });
    if (!e2eUser) {
      throw new NotFoundException({
        code: 'E2E_USER_NOT_SEEDED',
        message: `Usuário E2E (${E2E_DEFAULT_USER_EMAIL}) não existe. Rode a migration SeedE2EHarnessUser com E2E_HARNESS_PASSWORD definido, ou passe ownerUserId explícito.`,
      });
    }
    return e2eUser.id;
  }

  private buildAbilityScores(dto: SeedCharacterDto): Record<string, number> {
    const array = dto.abilityArray ?? this.allocateStandardArray(dto.classSlug);
    return {
      str: array[0],
      dex: array[1],
      con: array[2],
      int: array[3],
      wis: array[4],
      cha: array[5],
    };
  }

  /**
   * Aloca [15,14,13,12,10,8] com o 15 na ability primária da classe, 14 em CON
   * (sempre útil), 13/12 no resto por ordem lexicográfica. Determinístico.
   */
  private allocateStandardArray(classSlug: SupportedClassSlug): number[] {
    const result = [10, 10, 10, 10, 10, 10];
    const primaryIdx = PRIMARY_ABILITY_INDEX[classSlug];
    const conIdx = 2;

    result[primaryIdx] = STANDARD_ARRAY[0]; // 15
    if (primaryIdx !== conIdx) {
      result[conIdx] = STANDARD_ARRAY[1]; // 14 in CON
    }

    // Remaining scores [13, 12, 10, 8] filled in remaining slots in order
    const remainingScores =
      primaryIdx === conIdx
        ? [14, 13, 12, 10, 8]
        : [13, 12, 10, 8];
    let scoreIdx = 0;
    for (let i = 0; i < 6; i++) {
      if (i === primaryIdx || i === conIdx) continue;
      if (scoreIdx < remainingScores.length) {
        result[i] = remainingScores[scoreIdx++];
      }
    }
    return result;
  }

  private async ensureNameUnique(
    ownerUserId: string,
    name: string,
  ): Promise<void> {
    const existing = await this.characterRepo.findOne({
      where: { userId: ownerUserId, name },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CHARACTER_NAME_EXISTS',
        message: `Personagem "${name}" já existe para este usuário. Use nome diferente ou delete o anterior.`,
      });
    }
  }

  private async createLevel1Character(params: {
    ownerUserId: string;
    name: string;
    classSlug: SupportedClassSlug;
    abilityScores: Record<string, number>;
  }): Promise<CharacterEntity> {
    // Data mínima válida pro CharactersService.create (spec 001):
    // - abilityScores obrigatório
    // - classSlug + raceSlug + backgroundSlug resolvidos via slug
    // - classStartingGold bypassa a validação de classEquipmentChoices (gold em vez de escolha de item)
    const data: Record<string, unknown> = {
      sourceCode: 'XPHB',
      classSlug: params.classSlug,
      raceSlug: 'human',
      backgroundSlug: 'acolyte',
      abilityScores: params.abilityScores,
      abilityScoreMethod: 'standard-array',
      skills: [],
      classStartingGold: { gp: 100 },
      backgroundEquipmentChoices: ['A'],
    };

    return this.charactersService.create({
      userId: params.ownerUserId,
      name: params.name,
      data,
    });
  }

  private async buildSheetSummary(
    userId: string,
    characterId: string,
  ): Promise<SeedCharacterResult['sheetSummary']> {
    const sheet = (await this.characterSheetService.computeSheet(
      userId,
      characterId,
    )) as {
      totalLevel?: number;
      maxHp?: number;
      armorClass?: number;
      proficiencyBonus?: number;
      spellSlots?: unknown;
    };
    const level = sheet.totalLevel ?? 1;
    const hpMax = sheet.maxHp ?? 0;
    const armorClass = sheet.armorClass ?? 0;
    const proficiencyBonus = sheet.proficiencyBonus ?? 2;
    const slotsArray = this.normalizeSpellSlots(sheet.spellSlots);

    return {
      level,
      hpMax,
      armorClass,
      proficiencyBonus,
      ...(slotsArray ? { spellSlots: slotsArray } : {}),
    };
  }

  private normalizeSpellSlots(raw: unknown): number[] | undefined {
    const slots = new Array(9).fill(0) as number[];

    if (Array.isArray(raw)) {
      // Shape preferido do sheet atual: [{ level, total, used }]
      for (const entry of raw) {
        if (typeof entry === 'number') {
          // Fallback: array plano [2, 3, 0, ...]
          const idx = raw.indexOf(entry);
          if (idx >= 0 && idx < 9) slots[idx] = entry;
        } else if (entry && typeof entry === 'object') {
          const level = (entry as { level?: number }).level;
          const total = (entry as { total?: number }).total;
          if (
            typeof level === 'number'
            && level >= 1
            && level <= 9
            && typeof total === 'number'
          ) {
            slots[level - 1] = total;
          }
        }
      }
    } else if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      for (let i = 1; i <= 9; i++) {
        const val = obj[i] ?? obj[String(i)] ?? obj[`level${i}`];
        if (typeof val === 'number') slots[i - 1] = val;
      }
    }

    // Se tudo zero, não é caster — omite do summary.
    return slots.some((v) => v > 0) ? slots : undefined;
  }
}
