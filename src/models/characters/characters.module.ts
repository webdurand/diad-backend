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
  RaceTraitEntity,
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

  ReactionDefaultEntity,
  EncounterParticipantEntity,
  EncounterEntity,
  RestEventTemplateEntity,
  GameClockEntity,
  CampaignPartyMemberEntity,
} from "src/entities";
import { AuthModule } from "../auth/auth.module";
import { CombatActionsModule } from "../combat-actions/combat-actions.module";
import { ReputationDecayService } from "../world/services/reputation-decay.service";
import { GameClockService } from "../world/services/game-clock.service";
import { CharactersController } from "./characters.controller";
import { CharactersService } from "./services/characters.service";
import { CharacterSheetService } from "./services/character-sheet.service";
import { CharacterStateService } from "./services/character-state.service";
import { LevelUpService } from "./services/level-up.service";
import { SpellService } from "./services/spell.service";
import { InventoryService } from "./services/inventory.service";
import { ActionsService } from "./services/actions.service";
import { ReactionPrefsService } from "./services/reaction-prefs.service";
import { PcPersonaService } from "./services/pc-persona.service";

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
      RaceTraitEntity,
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

      ReactionDefaultEntity,
      EncounterParticipantEntity,
      EncounterEntity,
      RestEventTemplateEntity,
      GameClockEntity,
      CampaignPartyMemberEntity,
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

    ReactionPrefsService,

    PcPersonaService,




    ReputationDecayService,
    GameClockService,
  ],
  exports: [
    CharactersService,
    CharacterSheetService,
    CharacterStateService,
    ActionsService,
    SpellService,
    InventoryService,

    ReactionPrefsService,

    PcPersonaService,
  ],
})
export class CharactersModule {}
