import { Module } from "@nestjs/common";
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
  CampaignEntity,
  StoryArcEntity,
  NpcEntity,
  NpcRelationshipEntity,
  QuestEntity,
  VowEntity,
} from "src/entities";
import { AuthModule } from "../auth/auth.module";
import { WorldModule } from "../world/world.module";
import { SessionController } from "./session.controller";
import { SceneService } from "./services/scene.service";
import { EventLogService } from "./services/event-log.service";
import { ChronicleService } from "./services/chronicle.service";
import { SceneContextService } from "./services/scene-context.service";
import { SessionMessageService } from "./services/session-message.service";

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
      CampaignEntity,
      StoryArcEntity,
      NpcEntity,
      NpcRelationshipEntity,
      QuestEntity,
      VowEntity,
    ]),
    AuthModule,
    WorldModule,
  ],
  controllers: [SessionController],
  providers: [
    SceneService,
    EventLogService,
    ChronicleService,
    SceneContextService,
    SessionMessageService,
  ],
  exports: [
    SceneService,
    EventLogService,
    ChronicleService,
    SceneContextService,
    SessionMessageService,
  ],
})
export class SessionModule {}
