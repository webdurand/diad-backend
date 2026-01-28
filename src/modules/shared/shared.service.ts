import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  DeepPartial,
  DeleteResult,
  QueryFailedError,
} from 'typeorm';

@Injectable()
export class SharedService {
  constructor(private readonly entityManager: EntityManager) {}

  async create<T>(
    entityClass: EntityTarget<T>,
    data: DeepPartial<T>,
  ): Promise<T> {
    try {
      const entity = this.entityManager.create(entityClass, data);
      return await this.entityManager.save(entity);
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async findAll<T>(
    entityClass: EntityTarget<T>,
    options?: FindManyOptions<T>,
  ): Promise<T[]> {
    return await this.entityManager.find(entityClass, options);
  }

  async findOne<T>(
    entityClass: EntityTarget<T>,
    options: FindOneOptions<T>,
  ): Promise<T> {
    const entity = await this.entityManager.findOne(entityClass, options);
    if (!entity) throw new NotFoundException('Registro não encontrado');
    return entity;
  }

  async update<T>(
    entityClass: EntityTarget<T>,
    id: any,
    data: DeepPartial<T>,
  ): Promise<T> {
    // No EntityManager, o preload exige um pouco mais de cuidado com tipos
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

  async remove<T>(
    entityClass: EntityTarget<T>,
    id: any,
  ): Promise<DeleteResult> {
    try {
      const result = await this.entityManager.delete(entityClass, id);
      if (result.affected === 0)
        throw new NotFoundException('ID não encontrado');
      return result; // Retornando o DeleteResult como solicitado
    } catch (error) {
      this.handleErrors(error);
    }
  }

  private handleErrors(error: any): never {
    if (error instanceof QueryFailedError) {
      const code = (error as any).code;
      if (code === '23505') throw new ConflictException('Registro duplicado.');
      if (code === '23503')
        throw new BadRequestException('Violação de dependência (FK).');
    }
    throw new InternalServerErrorException('Erro no banco de dados');
  }
}
