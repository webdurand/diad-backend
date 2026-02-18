import { Controller, Get, Param, Query } from '@nestjs/common';
import { LibraryService } from './library.service';
import {
  ENTITY_CONFIG,
  transformLibraryResponse,
} from './library-response.config';

@Controller('library')
export class LibraryController {
  constructor(
    private readonly libraryService: LibraryService,
  ) {}
  @Get(':entity')
  async get(
    @Param('entity') entity: string,
    @Query('source') source?: string,
  ) {
    const config = ENTITY_CONFIG[entity];
    const relations = config?.relations ? [...config.relations] : [];
    const isSourceEntity = entity === 'comp_sources';
    if (
      !isSourceEntity &&
      !relations.some((r) => r === 'source' || r.startsWith('source.'))
    ) {
      relations.push('source');
    }

    const where = source && !isSourceEntity ? { source: { code: source } } : {};

    const results = await this.libraryService.findAll(entity, {
      relations,
      order: { name: 'ASC' } as Record<string, 'ASC' | 'DESC'>,
      ...(Object.keys(where).length ? { where } : {}),
    });
    return transformLibraryResponse(
      results as unknown as Record<string, unknown>[],
      entity,
    );
  }
}
