import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  HttpException,
} from "@nestjs/common";
import {
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  DeepPartial,
  DeleteResult,
  QueryFailedError,
  ObjectLiteral,
  SelectQueryBuilder,
} from "typeorm";
import { LibraryQueryDto } from "./dto/library-query.dto";
import { MonsterEntity } from "src/entities/monster.entity";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface MonsterSummary {
  id: string;
  slug: string;
  name: string;
  type: string;
  hit_points: number;
  challenge_rating: number;
  xp: number;
}

@Injectable()
export class LibraryService {
  private monsterSummaryCache:
    | { data: MonsterSummary[]; expiresAt: number }
    | undefined;
  private monsterSummaryLoad: Promise<MonsterSummary[]> | undefined;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(LibraryService.name);
  }

  private validateEntity(entityClass: EntityTarget<any>) {
    if (!entityClass) {
      throw new BadRequestException(
        "A entidade fornecida é inválida ou não foi mapeada corretamente.",
      );
    }
  }

  async findAll<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    options?: FindManyOptions<T>,
  ): Promise<T[]> {
    this.validateEntity(entityClass);
    try {
      return await this.entityManager.find(entityClass, options);
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async findPaginated<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    entityName: string,
    relations: string[],
    query: LibraryQueryDto,
  ): Promise<PaginatedResult<T>> {
    this.validateEntity(entityClass);

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    try {
      const qb = this.entityManager.createQueryBuilder(entityClass, "entity");

      for (const rel of relations) {
        const parts = rel.split(".");
        if (parts.length === 1) {
          qb.leftJoinAndSelect(`entity.${parts[0]}`, parts[0]);
        } else {
          const parentAlias = parts[0];
          const childField = parts[1];
          const childAlias = `${parentAlias}_${childField}`;

          if (!relations.includes(parentAlias)) {
            qb.leftJoinAndSelect(`entity.${parentAlias}`, parentAlias);
          }
          qb.leftJoinAndSelect(`${parentAlias}.${childField}`, childAlias);
        }
      }

      if (query.source) {
        if (entityName === "comp_sources") {
          qb.andWhere("entity.code = :sourceCode", {
            sourceCode: query.source,
          });
        } else {
          qb.innerJoin("entity.source", "source_filter").andWhere(
            "source_filter.code = :sourceCode",
            { sourceCode: query.source },
          );
        }
      }

      if (query.name) {
        qb.andWhere("entity.name ILIKE :name", { name: `%${query.name}%` });
      }

      this.applyEntityFilters(qb, entityName, query);

      qb.orderBy("entity.name", "ASC").skip(offset).take(limit);

      const [data, total] = await qb.getManyAndCount();
      return { data, total, limit, offset };
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async findMonsterSummaries(
    query: LibraryQueryDto,
  ): Promise<PaginatedResult<MonsterSummary>> {
    const limit = query.limit ?? 80;
    const offset = query.offset ?? 0;

    if (query.source) {
      return this.findMonsterSummariesFromDatabase(query);
    }

    try {
      const catalog = await this.loadMonsterSummaryCatalog();
      const normalizedName = query.name?.trim().toLocaleLowerCase();
      const normalizedType = query.type?.trim().toLocaleLowerCase();
      const crRange = this.parseCrRange(query.cr);
      const filtered = catalog.filter((monster) => {
        if (
          normalizedName &&
          !monster.name.toLocaleLowerCase().includes(normalizedName)
        ) {
          return false;
        }
        if (
          normalizedType &&
          !monster.type.toLocaleLowerCase().includes(normalizedType)
        ) {
          return false;
        }
        if (
          crRange &&
          (monster.challenge_rating < crRange.min ||
            monster.challenge_rating > crRange.max)
        ) {
          return false;
        }
        return true;
      });

      return {
        data: filtered.slice(offset, offset + limit),
        total: filtered.length,
        limit,
        offset,
      };
    } catch (error) {
      this.handleErrors(error);
    }
  }

  private async loadMonsterSummaryCatalog(): Promise<MonsterSummary[]> {
    if (
      this.monsterSummaryCache &&
      this.monsterSummaryCache.expiresAt > Date.now()
    ) {
      return this.monsterSummaryCache.data;
    }
    if (this.monsterSummaryLoad) return this.monsterSummaryLoad;

    const query = this.entityManager
      .createQueryBuilder(MonsterEntity, "entity")
      .select([
        "entity.id",
        "entity.slug",
        "entity.name",
        "entity.type",
        "entity.hit_points",
        "entity.challenge_rating",
        "entity.xp",
      ])
      .orderBy("entity.challenge_rating", "ASC")
      .addOrderBy("entity.name", "ASC")
      .getMany()
      .then((data) => {
        const summaries = data as MonsterSummary[];
        const ttl = Number(
          process.env.MONSTER_CATALOG_CACHE_TTL_MS ?? 15 * 60 * 1000,
        );
        this.monsterSummaryCache = {
          data: summaries,
          expiresAt: Date.now() + ttl,
        };
        return summaries;
      });

    this.monsterSummaryLoad = query;
    try {
      return await query;
    } finally {
      if (this.monsterSummaryLoad === query) {
        this.monsterSummaryLoad = undefined;
      }
    }
  }

  private parseCrRange(cr?: string): { min: number; max: number } | undefined {
    if (cr == null) return undefined;
    if (cr.includes("-")) {
      const [minRaw, maxRaw] = cr.split("-");
      const min = Number.parseFloat(minRaw);
      const max = Number.parseFloat(maxRaw);
      return Number.isFinite(min) && Number.isFinite(max)
        ? { min, max }
        : undefined;
    }
    const exact = Number.parseFloat(cr);
    return Number.isFinite(exact) ? { min: exact, max: exact } : undefined;
  }

  private async findMonsterSummariesFromDatabase(
    query: LibraryQueryDto,
  ): Promise<PaginatedResult<MonsterSummary>> {
    const limit = query.limit ?? 80;
    const offset = query.offset ?? 0;
    const qb = this.entityManager
      .createQueryBuilder(MonsterEntity, "entity")
      .select([
        "entity.id",
        "entity.slug",
        "entity.name",
        "entity.type",
        "entity.hit_points",
        "entity.challenge_rating",
        "entity.xp",
      ])
      .innerJoin("entity.source", "source_filter")
      .andWhere("source_filter.code = :sourceCode", {
        sourceCode: query.source,
      });

    if (query.name?.trim()) {
      qb.andWhere("entity.name ILIKE :name", {
        name: `%${query.name.trim()}%`,
      });
    }
    this.applyEntityFilters(qb, "monsters", query);
    qb.orderBy("entity.challenge_rating", "ASC")
      .addOrderBy("entity.name", "ASC")
      .skip(offset)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data: data as MonsterSummary[],
      total,
      limit,
      offset,
    };
  }

  private applyEntityFilters<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    entityName: string,
    query: LibraryQueryDto,
  ): void {
    if (entityName === "monsters") {
      if (query.cr != null) {
        const crStr = String(query.cr);
        if (crStr.includes("-")) {
          const [minStr, maxStr] = crStr.split("-");
          const minCr = parseFloat(minStr);
          const maxCr = parseFloat(maxStr);
          if (!isNaN(minCr) && !isNaN(maxCr)) {
            qb.andWhere("entity.challenge_rating >= :minCr", { minCr });
            qb.andWhere("entity.challenge_rating <= :maxCr", { maxCr });
          }
        } else {
          const exactCr = parseFloat(crStr);
          if (!isNaN(exactCr)) {
            qb.andWhere("entity.challenge_rating = :cr", { cr: exactCr });
          }
        }
      }
      if (query.type) {
        qb.andWhere("entity.type ILIKE :monsterType", {
          monsterType: `%${query.type}%`,
        });
      }
    }

    if (entityName === "spells") {
      if (query.level != null) {
        qb.andWhere("entity.level = :level", { level: query.level });
      }
      if (query.school) {
        qb.andWhere("school.name ILIKE :school", {
          school: `%${query.school}%`,
        });
      }
      if (query.class) {
        qb.andWhere("spell_classes_class.name ILIKE :className", {
          className: `%${query.class}%`,
        });
      }
    }

    if (entityName === "equipments") {
      if (query.category) {
        qb.andWhere("category_items_category.name ILIKE :category", {
          category: `%${query.category}%`,
        });
      }
    }
  }

  async findBeastsForForm(maxCr: number): Promise<MonsterEntity[]> {
    try {
      return await this.entityManager
        .createQueryBuilder(MonsterEntity, "monster")
        .where("monster.type = :type", { type: "beast" })
        .andWhere("monster.challenge_rating <= :maxCr", { maxCr })

        .andWhere("monster.slug NOT LIKE :summonPrefix", {
          summonPrefix: "beast-of-%",
        })
        .orderBy("monster.challenge_rating", "ASC")
        .addOrderBy("monster.name", "ASC")
        .getMany();
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async create<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    data: DeepPartial<T>,
  ): Promise<T> {
    this.validateEntity(entityClass);
    try {
      const entity = this.entityManager.create(entityClass, data);
      return await this.entityManager.save(entity);
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async findOne<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    options: FindOneOptions<T>,
  ): Promise<T> {
    this.validateEntity(entityClass);
    const entity = await this.entityManager.findOne(entityClass, options);
    if (!entity) throw new NotFoundException("Registro não encontrado");
    return entity;
  }

  async update<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    id: string | number,
    data: DeepPartial<T>,
  ): Promise<T> {
    this.validateEntity(entityClass);

    const entity = await this.entityManager.preload(entityClass, {
      ...data,
      id,
    } as unknown as DeepPartial<T>);

    if (!entity)
      throw new NotFoundException(`ID ${id} não encontrado para atualização`);

    try {
      return await this.entityManager.save(entity);
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async remove<T extends ObjectLiteral>(
    entityClass: EntityTarget<T>,
    id: string | number,
  ): Promise<DeleteResult> {
    this.validateEntity(entityClass);
    try {
      const result = await this.entityManager.delete(entityClass, id);
      if (result.affected === 0)
        throw new NotFoundException("ID não encontrado");
      return result;
    } catch (error) {
      this.handleErrors(error);
    }
  }

  private handleErrors(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const code = (error.driverError as { code?: string } | null | undefined)
        ?.code;
      if (code === "23505") throw new ConflictException("Registro duplicado.");
      if (code === "23503")
        throw new BadRequestException("Violação de dependência (FK).");
    }

    if (error instanceof HttpException) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === "EntityMetadataNotFoundError"
    ) {
      throw new BadRequestException(
        "A entidade informada não existe no esquema do banco.",
      );
    }

    this.logger.error("library.unexpected_error", error);
    throw new InternalServerErrorException("Erro inesperado no servidor");
  }
}
