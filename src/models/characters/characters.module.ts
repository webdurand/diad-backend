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
  ClassProficiencyEntity,
  SubclassEntity,
  FeatureEntity,
  SpellClassEntity,
  EquipmentEntity,
  MagicItemEntity,
  ClassStartingEquipmentEntity,
  EquipmentCategoryItemEntity,
} from 'src/entities';
import { AuthModule } from '../auth/auth.module';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
import { CharacterSheetService } from './character-sheet.service';
import { CharacterStateService } from './character-state.service';
import { LevelUpService } from './level-up.service';
import { SpellService } from './spell.service';
import { InventoryService } from './inventory.service';

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
      ClassProficiencyEntity,
      SubclassEntity,
      FeatureEntity,
      SpellClassEntity,
      EquipmentEntity,
      MagicItemEntity,
      ClassStartingEquipmentEntity,
      EquipmentCategoryItemEntity,
    ]),
    AuthModule,
  ],
  controllers: [CharactersController],
  providers: [
    CharactersService,
    CharacterSheetService,
    CharacterStateService,
    LevelUpService,
    SpellService,
    InventoryService,
  ],
})
export class CharactersModule {}
