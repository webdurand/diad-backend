import { Controller, Get, Param } from '@nestjs/common';
import { LibraryService } from './library.service';

@Controller('library')
export class LibraryController {
  constructor(
    private readonly libraryService: LibraryService,
  ) {}
  @Get(':entity')
  async get(@Param('entity') entity: string) {
    return this.libraryService.findAll(entity);
  }
}
