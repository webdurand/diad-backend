import { Module } from '@nestjs/common';
import { CharacterCreationService } from './character-creation.service';
import { CharacterCreationController } from './character-creation.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [CharacterCreationController],
  providers: [CharacterCreationService],
})
export class CharacterCreationModule {}
