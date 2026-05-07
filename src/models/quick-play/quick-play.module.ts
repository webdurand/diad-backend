import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  CampaignEntity,
  CampaignPlayerEntity,
  EncounterEntity,
  EncounterParticipantEntity,
  GameSessionEntity,
} from "src/entities";
import { AuthModule } from "../auth/auth.module";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { QuickPlayController } from "./quick-play.controller";
import { QuickPlayService } from "./quick-play.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CampaignEntity,
      GameSessionEntity,
      CampaignPlayerEntity,
      EncounterEntity,
      EncounterParticipantEntity,
    ]),
    AuthModule,
    GameEngineModule,
  ],
  controllers: [QuickPlayController],
  providers: [QuickPlayService],
  exports: [QuickPlayService],
})
export class QuickPlayModule {}
