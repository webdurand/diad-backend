import { Module } from '@nestjs/common';
import { CharacterCreationModule } from './modules/character-creation/character-creation.module';

@Module({
  imports: [CharacterCreationModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
