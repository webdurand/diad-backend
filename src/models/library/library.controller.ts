import { Controller, Get, Param, Query } from '@nestjs/common';
import { LibraryService } from './library.service';
import {
  ENTITY_CONFIG,
  transformLibraryResponse,
} from './library-response.config';
import { LibraryQueryDto } from './dto/library-query.dto';

@Controller('library')
export class LibraryController {
  constructor(
    private readonly libraryService: LibraryService,
  ) {}

  /**
   * Spec 007: paginated library endpoint with strict source filter and
   * entity-specific filters (cr, level, class, category, name).
   *
   * Response: { data: T[], total: number, limit: number, offset: number }
   */
  @Get(':entity')
  async get(
    @Param('entity') entity: string,
    @Query() query: LibraryQueryDto,
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

    const result = await this.libraryService.findPaginated(
      entity,
      entity,
      relations,
      query,
    );

    const transformed = transformLibraryResponse(
      result.data as unknown as Record<string, unknown>[],
      entity,
    );

    return {
      data: transformed,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  }
}
