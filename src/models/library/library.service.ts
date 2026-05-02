import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
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

@Injectable()
export class LibraryService {
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

  /**
   * Spec 007: paginated query with strict source filter and entity-specific filters.
   */
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

      // Load relations via leftJoinAndSelect
      for (const rel of relations) {
        const parts = rel.split(".");
        if (parts.length === 1) {
          qb.leftJoinAndSelect(`entity.${parts[0]}`, parts[0]);
        } else {
          // Nested relation: e.g. 'spell_classes.class' → join spell_classes on entity, then class on spell_classes
          const parentAlias = parts[0];
          const childField = parts[1];
          const childAlias = `${parentAlias}_${childField}`;
          // Only add the parent join if not already added
          if (!relations.includes(parentAlias)) {
            qb.leftJoinAndSelect(`entity.${parentAlias}`, parentAlias);
          }
          qb.leftJoinAndSelect(`${parentAlias}.${childField}`, childAlias);
        }
      }
      // Also add standalone parent joins for dotted relations
      const standaloneParents = new Set<string>();
      for (const rel of relations) {
        const parts = rel.split(".");
        if (parts.length > 1 && !relations.includes(parts[0])) {
          standaloneParents.add(parts[0]);
        }
      }
      for (const parent of standaloneParents) {
        // Already handled in the loop above, but ensure no duplicate
      }

      // Strict source filter via INNER JOIN
      if (query.source) {
        if (entityName === "comp_sources") {
          qb.andWhere("entity.code = :sourceCode", {
            sourceCode: query.source,
          });
        } else {
          // Use innerJoin to ensure strict filtering — only entries matching the source
          qb.innerJoin("entity.source", "source_filter").andWhere(
            "source_filter.code = :sourceCode",
            { sourceCode: query.source },
          );
        }
      }

      // Name filter (ILIKE) — available for all entities
      if (query.name) {
        qb.andWhere("entity.name ILIKE :name", { name: `%${query.name}%` });
      }

      // Entity-specific filters
      this.applyEntityFilters(qb, entityName, query);

      qb.orderBy("entity.name", "ASC").skip(offset).take(limit);

      const [data, total] = await qb.getManyAndCount();
      return { data, total, limit, offset };
    } catch (error) {
      this.handleErrors(error);
    }
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
        // school is a relation already joined via relations config
        qb.andWhere("school.name ILIKE :school", {
          school: `%${query.school}%`,
        });
      }
      if (query.class) {
        // spell_classes.class already joined via relations config
        qb.andWhere("spell_classes_class.name ILIKE :className", {
          className: `%${query.class}%`,
        });
      }
    }

    if (entityName === "equipments") {
      if (query.category) {
        // category_items.category already joined via relations config
        qb.andWhere("category_items_category.name ILIKE :category", {
          category: `%${query.category}%`,
        });
      }
    }
  }

  /**
   * Spec 015 Eixo 4: lista beasts com CR ≤ maxCr ordenados por CR asc.
   * Usado pelo picker de Wild Shape/Polymorph/True Polymorph. Não aplica
   * source filter (Polymorph usa SRD base).
   *
   * Filtra "summons" genéricos (Beast of the Land/Sea/Sky do Summon Beast
   * XPHB 2024 e Ranger Primal Companion) que têm type='beast' mas não são
   * feras reais RAW — são templates conjurados.
   */
  async findBeastsForForm(maxCr: number): Promise<MonsterEntity[]> {
    try {
      return await this.entityManager
        .createQueryBuilder(MonsterEntity, "monster")
        .where("monster.type = :type", { type: "beast" })
        .andWhere("monster.challenge_rating <= :maxCr", { maxCr })
        // Exclui summons conjurados. Slugs SRD: beast-of-the-land,
        // beast-of-the-sea, beast-of-the-sky, beast-of-the-land-tce, etc.
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
    id: any,
    data: DeepPartial<T>,
  ): Promise<T> {
    this.validateEntity(entityClass);

    // Tentativa de preload
    const entity = await this.entityManager.preload(entityClass, {
      id,
      ...data,
    } as any);

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
    id: any,
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

  private handleErrors(error: any): never {
    // Erros de violação de banco (TypeORM)
    if (error instanceof QueryFailedError) {
      const code = (error as any).code;
      if (code === "23505") throw new ConflictException("Registro duplicado.");
      if (code === "23503")
        throw new BadRequestException("Violação de dependência (FK).");
    }

    // Se o erro já for uma HttpException (como o nosso BadRequest do validateEntity), apenas repassa
    if (error.status && error.response) {
      throw error;
    }

    // Erro de metadados do TypeORM (quando a entidade é lixo/null)
    if (error.name === "EntityMetadataNotFoundError") {
      throw new BadRequestException(
        "A entidade informada não existe no esquema do banco.",
      );
    }

    this.logger.error("library.unexpected_error", error);
    throw new InternalServerErrorException("Erro inesperado no servidor");
  }
}
