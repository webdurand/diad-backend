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

  // Centralizamos a validação da classe da entidade aqui
  private validateEntity(entityClass: EntityTarget<any>) {
    if (!entityClass) {
      throw new BadRequestException(
        'A entidade fornecida é inválida ou não foi mapeada corretamente.',
      );
    }
  }

  async findAll<T>(
    entityClass: EntityTarget<T>,
    options?: FindManyOptions<T>,
  ): Promise<T[]> {
    this.validateEntity(entityClass); // Valida antes de tentar o find
    try {
      return await this.entityManager.find(entityClass, options);
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async create<T>(
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

  async findOne<T>(
    entityClass: EntityTarget<T>,
    options: FindOneOptions<T>,
  ): Promise<T> {
    this.validateEntity(entityClass);
    const entity = await this.entityManager.findOne(entityClass, options);
    if (!entity) throw new NotFoundException('Registro não encontrado');
    return entity;
  }

  async update<T>(
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

  async remove<T>(
    entityClass: EntityTarget<T>,
    id: any,
  ): Promise<DeleteResult> {
    this.validateEntity(entityClass);
    try {
      const result = await this.entityManager.delete(entityClass, id);
      if (result.affected === 0)
        throw new NotFoundException('ID não encontrado');
      return result;
    } catch (error) {
      this.handleErrors(error);
    }
  }

  private handleErrors(error: any): never {
    // Erros de violação de banco (TypeORM)
    if (error instanceof QueryFailedError) {
      const code = (error as any).code;
      if (code === '23505') throw new ConflictException('Registro duplicado.');
      if (code === '23503')
        throw new BadRequestException('Violação de dependência (FK).');
    }

    // Se o erro já for uma HttpException (como o nosso BadRequest do validateEntity), apenas repassa
    if (error.status && error.response) {
      throw error;
    }

    // Erro de metadados do TypeORM (quando a entidade é lixo/null)
    if (error.name === 'EntityMetadataNotFoundError') {
      throw new BadRequestException(
        'A entidade informada não existe no esquema do banco.',
      );
    }

    console.error(error); // Log para debug interno
    throw new InternalServerErrorException('Erro inesperado no servidor');
  }
}
