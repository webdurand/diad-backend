import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CharacterEntity,
  CharacterClassEntity,
  CharacterAbilityScoreEntity,
  CharacterSkillEntity,
  CharacterProficiencyEntity,
  CharacterSpellEntity,
  CharacterEquipmentEntity,
  CharacterMagicItemEntity,
  CharacterStateEntity,
  CharacterLevelUpEntity,
  CharacterFeatureEntity,
  CharacterOriginEntity,
  ClassEntity,
  AbilityScoreEntity,
  SkillEntity,
  ProficiencyEntity,
  SpellEntity,
  RaceEntity,
  SubraceEntity,
  BackgroundEntity,
  AlignmentEntity,
  LevelEntity,
  ClassSavingThrowEntity,
  SubclassEntity,
  FeatureEntity,
} from 'src/entities';
import { AuthModule } from '../auth/auth.module';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
import { CharacterSheetService } from './character-sheet.service';
import { CharacterStateService } from './character-state.service';
import { LevelUpService } from './level-up.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CharacterEntity,
      CharacterClassEntity,
      CharacterAbilityScoreEntity,
      CharacterSkillEntity,
      CharacterProficiencyEntity,
      CharacterSpellEntity,
      CharacterEquipmentEntity,
      CharacterMagicItemEntity,
      CharacterStateEntity,
      CharacterLevelUpEntity,
      CharacterFeatureEntity,
      CharacterOriginEntity,
      ClassEntity,
      AbilityScoreEntity,
      SkillEntity,
      ProficiencyEntity,
      SpellEntity,
      RaceEntity,
      SubraceEntity,
      BackgroundEntity,
      AlignmentEntity,
      LevelEntity,
      ClassSavingThrowEntity,
      SubclassEntity,
      FeatureEntity,
    ]),
    AuthModule,
  ],
  controllers: [CharactersController],
  providers: [
    CharactersService,
    CharacterSheetService,
    CharacterStateService,
    LevelUpService,
  ],
})
export class CharactersModule {}
