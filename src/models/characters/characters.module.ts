import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
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
  CompSourceEntity,
  // Spec 016 — Play Shell Foundation
  ReactionDefaultEntity,
  EncounterParticipantEntity,
  EncounterEntity,
} from "src/entities";
import { AuthModule } from "../auth/auth.module";
import { CombatActionsModule } from "../combat-actions/combat-actions.module";
import { CharactersController } from "./characters.controller";
import { CharactersService } from "./services/characters.service";
import { CharacterSheetService } from "./services/character-sheet.service";
import { CharacterStateService } from "./services/character-state.service";
import { LevelUpService } from "./services/level-up.service";
import { SpellService } from "./services/spell.service";
import { InventoryService } from "./services/inventory.service";
import { ActionsService } from "./services/actions.service";
import { ReactionPrefsService } from "./services/reaction-prefs.service";

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
      CompSourceEntity,
      // Spec 016 — Play Shell Foundation
      ReactionDefaultEntity,
      EncounterParticipantEntity,
      EncounterEntity,
    ]),
    AuthModule,
    CombatActionsModule,
  ],
  controllers: [CharactersController],
  providers: [
    CharactersService,
    CharacterSheetService,
    CharacterStateService,
    LevelUpService,
    SpellService,
    InventoryService,
    ActionsService,
    // Spec 016 — Play Shell Foundation
    ReactionPrefsService,
  ],
  exports: [
    CharactersService,
    CharacterSheetService,
    CharacterStateService,
    ActionsService,
    SpellService,
    InventoryService,
    // Spec 016 — Play Shell Foundation
    ReactionPrefsService,
  ],
})
export class CharactersModule {}
