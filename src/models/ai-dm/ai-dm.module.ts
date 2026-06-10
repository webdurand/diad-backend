import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  ClockEntity,
  ContinuityFactEntity,
  NarrativeDecisionEntity,
  LoreEntryEntity,
  EndingSlideEntity,
  VoiceProfileEntity,
  GameSessionEntity,
  AiUsageLogEntity,
  SessionNpcStateEntity,
  LocationEntity,
  LocationConnectionEntity,
  SceneEntity,
} from "src/entities";
import { AuthModule } from "../auth/auth.module";
import { WorldModule } from "../world/world.module";
import { SessionModule } from "../session/session.module";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { AiDmController } from "./ai-dm.controller";
import { ClockService } from "./services/clock.service";
import { NarrativeDecisionService } from "./services/narrative-decision.service";
import { ContinuityFactService } from "./services/continuity-fact.service";
import { LoreEntryService } from "./services/lore-entry.service";
import { VoiceProfileService } from "./services/voice-profile.service";
import { AiUsageService } from "./services/ai-usage.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClockEntity,
      ContinuityFactEntity,
      NarrativeDecisionEntity,
      LoreEntryEntity,
      EndingSlideEntity,
      VoiceProfileEntity,
      GameSessionEntity,
      AiUsageLogEntity,
      SessionNpcStateEntity,
  LocationEntity,
  LocationConnectionEntity,
  SceneEntity,
    ]),
    AuthModule,
    WorldModule,
    SessionModule,
    forwardRef(() => GameEngineModule),
  ],
  controllers: [AiDmController],
  providers: [
    ClockService,
    ContinuityFactService,
    NarrativeDecisionService,
    LoreEntryService,
    VoiceProfileService,
    AiUsageService,
  ],
  exports: [
    ClockService,
    ContinuityFactService,
    NarrativeDecisionService,
    LoreEntryService,
    VoiceProfileService,
    AiUsageService,
  ],
})
export class AiDmModule {}
