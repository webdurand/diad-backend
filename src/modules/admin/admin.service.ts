import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AbilityScoreEntity } from '../shared/entities/ability-score.entity';
import { Repository } from 'typeorm';
import { join } from 'path';
import { readFile } from 'fs/promises';

// ... sua função smartMap aqui (mantenha-a fora da classe ou como private)

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AbilityScoreEntity)
    private readonly abilityScoreRepository: Repository<AbilityScoreEntity>,
  ) {}

  /**
   * Lê um arquivo JSON de uma pasta específica e faz o upload para o banco
   * @param fileName Nome do arquivo (ex: 'ability-scores.json')
   */
  async uploadFromJsonFile(fileName: string): Promise<AbilityScoreEntity[]> {
    // 1. Definir o caminho (exemplo: src/database/seeds/json/...)
    // __dirname geralmente aponta para a pasta do service dentro de 'dist'
    // Ajuste o caminho '../..' conforme sua estrutura de pastas
    const filePath = join(process.cwd(), 'src', 'data', 'json', fileName);

    let rawData: any;

    // 2. Tentar ler o arquivo
    try {
      const fileContent = await readFile(filePath, 'utf-8');
      rawData = JSON.parse(fileContent);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException(`Arquivo não encontrado em: ${filePath}`);
      }
      throw new BadRequestException(
        `Erro ao ler ou processar o JSON: ${error.message}`,
      );
    }

    // 3. Validar se o JSON é um array
    if (!Array.isArray(rawData)) {
      // Se for um objeto único, transformamos em array para o smartMap
      rawData = [rawData];
    }

    // 4. Usar o smartMap que criamos para validar e mapear
    try {
      const validatedEntities = await smartMap(
        this.abilityScoreRepository,
        rawData,
      );

      // 5. Salvar no banco
      return await this.abilityScoreRepository.save(validatedEntities);
    } catch (error) {
      // Repassa erros de validação do smartMap ou erros de banco
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Erro ao salvar dados do arquivo: ${error.message}`,
      );
    }
  }
}
