import { Module, OnModuleInit } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  SceneEntity,
  SceneNpcEntity,
  SessionEventEntity,
  SessionMessageEntity,
  CampaignChronicleEntity,
  PartyKnowledgeEntity,
  GameSessionEntity,
  LocationEntity,
  LocationPoiEntity,
  LocationConnectionEntity,
  CampaignEntity,
  StoryArcEntity,
  NpcEntity,
  NpcRelationshipEntity,
  QuestEntity,
  SessionNpcStateEntity,
  SessionStoryArcStateEntity,
  OpeningArchetypeEntity,
} from "src/entities";
import { AuthModule } from "../auth/auth.module";
import { WorldModule } from "../world/world.module";
import { CharactersModule } from "../characters/characters.module";
import { SessionController } from "./session.controller";
import { SceneService } from "./services/scene.service";
import { EventLogService } from "./services/event-log.service";
import { ChronicleService } from "./services/chronicle.service";
import { SceneContextService } from "./services/scene-context.service";
import { SceneContextCacheService } from "./services/scene-context-cache.service";
import { SessionMessageService } from "./services/session-message.service";
import { SessionRecapService } from "./services/session-recap.service";
import { SessionResumeService } from "./services/session-resume.service";
import { MovementLockService } from "./services/movement-lock.service";
import { GenerateColdOpenHookUseCase } from "../cold-open/application/generate-cold-open-hook.use-case";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { BookendOrchestratorListener } from "../bookends/services/bookend-orchestrator.listener";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SceneEntity,
      SceneNpcEntity,
      SessionEventEntity,
      SessionMessageEntity,
      CampaignChronicleEntity,
      PartyKnowledgeEntity,
      GameSessionEntity,
      LocationEntity,
      LocationPoiEntity,
      LocationConnectionEntity,
      CampaignEntity,
      StoryArcEntity,
      NpcEntity,
      NpcRelationshipEntity,
      QuestEntity,
      SessionNpcStateEntity,
      SessionStoryArcStateEntity,
      OpeningArchetypeEntity,
    ]),
    AuthModule,
    WorldModule,
    CharactersModule,
  ],
  controllers: [SessionController],
  providers: [
    SceneService,
    EventLogService,
    ChronicleService,
    SceneContextService,
    SceneContextCacheService,
    SessionMessageService,
    SessionRecapService,
    SessionResumeService,
    MovementLockService,
    GenerateColdOpenHookUseCase,
    BookendOrchestratorListener,
  ],
  exports: [
    SceneService,
    EventLogService,
    ChronicleService,
    SceneContextService,
    SceneContextCacheService,
    SessionMessageService,
    SessionRecapService,
    SessionResumeService,
    MovementLockService,
    GenerateColdOpenHookUseCase,
  ],
})
export class SessionModule implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly bookendOrchestrator: BookendOrchestratorListener,
  ) {}

  onModuleInit(): void {
    this.eventBus.registerListener(this.bookendOrchestrator);
  }
}
