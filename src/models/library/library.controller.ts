import { Controller, Get, Param } from '@nestjs/common';
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
  async get(@Param('entity') entity: string) {
    const config = ENTITY_CONFIG[entity];
    const results = await this.libraryService.findAll(entity, {
      ...(config?.relations ? { relations: config.relations } : {}),
    });
    return transformLibraryResponse(
      results as unknown as Record<string, unknown>[],
      entity,
    );
  }
}
