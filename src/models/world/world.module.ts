import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
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
  // Spec 019
  WeatherEntity,
  GameClockEntity,
  ClockEntity,
  SceneEntity,
} from "src/entities";
import { AuthModule } from "../auth/auth.module";
import { WorldController } from "./world.controller";
import { CampaignService } from "./services/campaign.service";
import { LocationService } from "./services/location.service";
import { NpcService } from "./services/npc.service";
import { FactionService } from "./services/faction.service";
import { QuestService } from "./services/quest.service";
// Spec 019 — Living World & Ambiance
import { AmbianceService } from "./services/ambiance.service";
import { WeatherService } from "./services/weather.service";
import { GameClockService } from "./services/game-clock.service";
import { ChaosFactorService } from "./services/chaos-factor.service";

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
      // Spec 019
      WeatherEntity,
      GameClockEntity,
      ClockEntity,
      SceneEntity,
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
    // Spec 019 — Living World & Ambiance
    AmbianceService,
    WeatherService,
    GameClockService,
    ChaosFactorService,
  ],
  exports: [
    CampaignService,
    LocationService,
    NpcService,
    FactionService,
    QuestService,
    // Spec 019
    AmbianceService,
    WeatherService,
    GameClockService,
    ChaosFactorService,
  ],
})
export class WorldModule {}
