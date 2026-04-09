import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CampaignEntity,
  CampaignPlayerEntity,
  LocationEntity,
  LocationConnectionEntity,
  NpcEntity,
  NpcRelationshipEntity,
  FactionEntity,
  FactionRelationEntity,
  StoryArcEntity,
  QuestEntity,
  QuestObjectiveEntity,
  QuestPrerequisiteEntity,
  LootTableEntity,
  LootTableItemEntity,
  EncounterTemplateEntity,
  UserEntity,
  CharacterEntity,
  MonsterEntity,
  EquipmentEntity,
  MagicItemEntity,
} from 'src/entities';
import { AuthModule } from '../auth/auth.module';
import { WorldController } from './world.controller';
import { CampaignService } from './services/campaign.service';
import { LocationService } from './services/location.service';
import { NpcService } from './services/npc.service';
import { FactionService } from './services/faction.service';
import { QuestService } from './services/quest.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CampaignEntity,
      CampaignPlayerEntity,
      LocationEntity,
      LocationConnectionEntity,
      NpcEntity,
      NpcRelationshipEntity,
      FactionEntity,
      FactionRelationEntity,
      StoryArcEntity,
      QuestEntity,
      QuestObjectiveEntity,
      QuestPrerequisiteEntity,
      LootTableEntity,
      LootTableItemEntity,
      EncounterTemplateEntity,
      UserEntity,
      CharacterEntity,
      MonsterEntity,
      EquipmentEntity,
      MagicItemEntity,
    ]),
    AuthModule,
  ],
  controllers: [WorldController],
  providers: [
    CampaignService,
    LocationService,
    NpcService,
    FactionService,
    QuestService,
  ],
  exports: [
    CampaignService,
    LocationService,
    NpcService,
    FactionService,
    QuestService,
  ],
})
export class WorldModule {}
