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

      const standaloneParents = new Set<string>();
      for (const rel of relations) {
        const parts = rel.split(".");
        if (parts.length > 1 && !relations.includes(parts[0])) {
          standaloneParents.add(parts[0]);
        }
      }
      for (const parent of standaloneParents) {

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
    id: any,
    data: DeepPartial<T>,
  ): Promise<T> {
    this.validateEntity(entityClass);


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

    if (error instanceof QueryFailedError) {
      const code = (error as any).code;
      if (code === "23505") throw new ConflictException("Registro duplicado.");
      if (code === "23503")
        throw new BadRequestException("Violação de dependência (FK).");
    }


    if (error.status && error.response) {
      throw error;
    }


    if (error.name === "EntityMetadataNotFoundError") {
      throw new BadRequestException(
        "A entidade informada não existe no esquema do banco.",
      );
    }

    this.logger.error("library.unexpected_error", error);
    throw new InternalServerErrorException("Erro inesperado no servidor");
  }
}
