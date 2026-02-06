import { Injectable, BadRequestException } from '@nestjs/common';
import { SharedService } from '../shared/shared.service';
import { entityMap, entityRelations } from '../shared/types/entities';

@Injectable()
export class CharacterCreationService {
  constructor(private readonly shared: SharedService) {}

  async get(entity: string) {
    // Mapear string para classe de entidade
    const entityKey = Object.keys(entityMap).find(
      (e) =>
        e.toLowerCase() === entity.toLowerCase() ||
        e.toLowerCase().replace('entity', '') === entity.toLowerCase(),
    );

    if (!entityKey) {
      throw new BadRequestException(`Entidade "${entity}" não encontrada`);
    }

    const entityClass = entityMap[entityKey];
    const relations = entityRelations[entityKey] || [];

    // Carregar com relações
    return this.shared.findAll(entityClass, {
      relations,
    });
  }
}
