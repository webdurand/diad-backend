import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  CampaignEntity,
  CampaignPlayerEntity,
  CharacterStateEntity,
  EncounterEntity,
  EncounterParticipantEntity,
  GameSessionEntity,
} from "src/entities";
import { AuthModule } from "../auth/auth.module";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { QuickPlayController } from "./quick-play.controller";
import { QuickPlayService } from "./quick-play.service";
import { CharactersModule } from "../characters/characters.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CampaignEntity,
      GameSessionEntity,
      CampaignPlayerEntity,
      CharacterStateEntity,
      EncounterEntity,
      EncounterParticipantEntity,
    ]),
    AuthModule,
    CharactersModule,
    GameEngineModule,
  ],
  controllers: [QuickPlayController],
  providers: [QuickPlayService],
  exports: [QuickPlayService],
})
export class QuickPlayModule {}
