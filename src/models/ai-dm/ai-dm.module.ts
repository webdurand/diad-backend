import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ClockEntity,
  VowEntity,
  NarrativeDecisionEntity,
  LoreEntryEntity,
  EndingSlideEntity,
  VoiceProfileEntity,
  GameSessionEntity,
  AiUsageLogEntity,
} from 'src/entities';
import { AuthModule } from '../auth/auth.module';
import { WorldModule } from '../world/world.module';
import { SessionModule } from '../session/session.module';
import { AiDmController } from './ai-dm.controller';
import { ClockService } from './services/clock.service';
import { VowService } from './services/vow.service';
import { NarrativeDecisionService } from './services/narrative-decision.service';
import { LoreEntryService } from './services/lore-entry.service';
import { VoiceProfileService } from './services/voice-profile.service';
import { AiUsageService } from './services/ai-usage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClockEntity,
      VowEntity,
      NarrativeDecisionEntity,
      LoreEntryEntity,
      EndingSlideEntity,
      VoiceProfileEntity,
      GameSessionEntity,
      AiUsageLogEntity,
    ]),
    AuthModule,
    WorldModule,
    SessionModule,
  ],
  controllers: [AiDmController],
  providers: [
    ClockService,
    VowService,
    NarrativeDecisionService,
    LoreEntryService,
    VoiceProfileService,
    AiUsageService,
  ],
  exports: [
    ClockService,
    VowService,
    NarrativeDecisionService,
    LoreEntryService,
    VoiceProfileService,
    AiUsageService,
  ],
})
export class AiDmModule {}
