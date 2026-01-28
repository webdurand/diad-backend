import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, ObjectLiteral } from 'typeorm';
import { join } from 'path';
import { readFile } from 'fs/promises';

// O smartMap continua igual, ele já é genérico o suficiente!
async function smartMap<T extends ObjectLiteral>(
  repo: any,
  rawData: any[],
): Promise<T[]> {
  const metadata = repo.metadata;

  // Mapeia apenas colunas que NÃO são chave primária nem geradas
  const columns = metadata.columns
    .filter((col) => !col.isPrimary && !col.isGenerated)
    .map((col) => col.propertyName);

  // Mapeia relacionamentos
  const relations = metadata.relations.map((rel) => rel.propertyName);

  const mandatoryColumns = metadata.columns
    .filter((col) => !col.isNullable && !col.isGenerated && !col.isPrimary)
    .map((col) => col.propertyName);

  return rawData.map((item, index) => {
    const entity = repo.create();

    columns.forEach((col) => {
      if (item[col] !== undefined) {
        entity[col] = item[col];
      }
    });

    relations.forEach((rel) => {
      if (item[rel] !== undefined) {
        entity[rel] = item[rel];
      }
    });

    for (const col of mandatoryColumns) {
      if (entity[col] === undefined || entity[col] === null) {
        throw new BadRequestException(
          `Erro no item [${index}]: O campo '${col}' é obrigatório para ${metadata.name}.`,
        );
      }
    }

    return entity;
  });
}
@Injectable()
export class AdminService {
  // Injetamos o DataSource para acessar qualquer tabela/entidade
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * @param fileName Ex: 'ability-scores.json'
   * @param entityName Ex: 'AbilityScoreEntity' ou o nome da classe da Entity
   */
  async uploadFromJsonFile(fileName: string, entityName: string): Promise<any> {
    const filePath = join(process.cwd(), 'src', 'data', 'json', fileName);

    let repository;
    try {
      repository = this.dataSource.getRepository(entityName);
    } catch (error) {
      throw new BadRequestException(
        `Entidade '${entityName}' não encontrada no sistema.`,
      );
    }

    let rawData: any;
    try {
      const fileContent = await readFile(filePath, 'utf-8');
      rawData = JSON.parse(fileContent);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`Arquivo não encontrado em: ${filePath}`);
      }
      throw new BadRequestException(`Erro no JSON: ${error.message}`);
    }

    const dataArray = Array.isArray(rawData) ? rawData : [rawData];

    // --- CORREÇÃO: Lógica específica para vincular relacionamentos existentes ---
    if (entityName === 'EquipmentEntity') {
      console.log(
        '[AdminService] Pré-carregando categorias para vincular corretamente...',
      );

      // 1. Busca todas as categorias já salvas no banco
      const categoryRepo = this.dataSource.getRepository(
        'EquipmentCategoryEntity',
      );
      const allCategories = await categoryRepo.find();

      // 2. Cria um mapa para busca rápida: 'adventuring-gear' -> Entity { id: 'uuid...', ... }
      const categoryMap = new Map(allCategories.map((cat) => [cat.index, cat]));

      // 3. Percorre o JSON e substitui o objeto simples pela Entidade com ID
      dataArray.forEach((item) => {
        if (
          item.equipment_categories &&
          Array.isArray(item.equipment_categories)
        ) {
          const validCategories = item.equipment_categories
            .map((catJson) => categoryMap.get(catJson.index)) // Busca pelo index vindo do JSON
            .filter((found) => !!found); // Filtra caso alguma categoria não exista no banco (opcional)

          // Substitui no objeto original
          item.equipment_categories = validCategories;
        }
      });
      console.log(
        `[AdminService] Categorias vinculadas em ${dataArray.length} itens.`,
      );
    }
    // --------------------------------------------------------------------------

    try {
      console.log(
        `[AdminService] Validando dados do arquivo: ${fileName} para a entidade: ${entityName}`,
      );

      // Agora o smartMap vai receber as Entidades de Categoria JÁ com IDs dentro do array
      const validatedEntities = await smartMap(repository, dataArray);

      console.log(
        `[AdminService] Validação concluída. Subindo ${validatedEntities.length} registros...`,
      );

      // Usamos .save() para garantir que a tabela pivô (ManyToMany) seja preenchida
      const result = await repository.save(validatedEntities);

      console.log(
        `[AdminService] Salvo com sucesso! Registros processados: ${result.length}`,
      );
      return result;
    } catch (error) {
      console.error(`[AdminService] Erro ao processar upload:`, error);
      if (error && error.code === '23505') {
        console.error(`[AdminService] Duplicidade detectada: ${error.detail}`);
      }
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Erro ao salvar em ${entityName}: ${error.message}`,
      );
    }
  }

  async testEquipmentCategoryRelation() {
    const repo = this.dataSource.getRepository('EquipmentEntity');
    // Busca 5 equipamentos e popula a categoria
    const result = await repo.find({
      relations: ['equipment_categories'],
      take: 5,
    });
    // Retorna se pelo menos um equipamento tem categoria populada
    const allHaveCategory = result.every(
      (e) => e.equipment_categories && e.equipment_categories.length > 0,
    );
    return {
      total: result.length,
      allHaveCategory,
      sample: result.map((e) => ({
        name: e.name,
        category: e.equipment_categories
          ? e.equipment_categories.name || e.equipment_categories.index
          : null,
      })),
    };
  }

  async returnAll(entityName: string): Promise<any[]> {
    let repository;
    try {
      repository = this.dataSource.getRepository(entityName);
    } catch (error) {
      throw new BadRequestException(
        `Entidade '${entityName}' não encontrada no sistema.`,
      );
    }
    return repository.find();
  }

  async clearTable(entityName: string): Promise<void> {
    let repository;
    try {
      repository = this.dataSource.getRepository(entityName);
    } catch (error) {
      throw new BadRequestException(
        `Entidade '${entityName}' não encontrada no sistema.`,
      );
    }
    await repository.createQueryBuilder().delete().execute();
  }
}
