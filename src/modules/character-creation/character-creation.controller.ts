import { Controller, Get, Param } from '@nestjs/common';
import { CharacterCreationService } from './character-creation.service';

@Controller('character-creation')
export class CharacterCreationController {
  constructor(
    private readonly characterCreationService: CharacterCreationService,
  ) {}
  @Get(':entity')
  async get(@Param('entity') entity: string) {
    return this.characterCreationService.get(entity);
  }
}
