import { Controller, Get, Param } from '@nestjs/common';
import { CharacterCreationService } from './character-creation.service';

@Controller('character-creation')
export class CharacterCreationController {
  constructor(
    private readonly characterCreationService: CharacterCreationService,
  ) {}

  @Get('entities/:entity')
  async getAllEntities(@Param('entity') entity: string) {
    return this.characterCreationService.getAll(entity);
  }
}
