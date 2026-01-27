import { Controller } from '@nestjs/common';
import { CharacterCreationService } from './character-creation.service';

@Controller('character-creation')
export class CharacterCreationController {
  constructor(
    private readonly characterCreationService: CharacterCreationService,
  ) {}
}
