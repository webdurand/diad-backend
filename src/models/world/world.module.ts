import { forwardRef, Module, OnModuleInit } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  CampaignEntity,
  CampaignPlayerEntity,
  LocationEntity,
  LocationConnectionEntity,
  NpcEntity,
  NpcArchetypeTemplateEntity,
  NpcRelationshipEntity,
  NpcStoryHookEntity,
  FactionEntity,
  FactionRelationEntity,
  LocationPoiEntity,
  StoryArcEntity,
  PhaseEntity,
  PhaseTransitionEntity,
  QuestEntity,
  QuestObjectiveEntity,
  QuestPrerequisiteEntity,
  LootTableEntity,
  LootTableItemEntity,
  EncounterTemplateEntity,
  EncounterEntity,
  EncounterParticipantEntity,
  EventListenerProcessedEntity,
  UserEntity,
  CharacterEntity,
  CharacterStateEntity,
  MonsterEntity,
  EquipmentEntity,
  MagicItemEntity,

  WeatherEntity,
  GameClockEntity,
  ClockEntity,
  SceneEntity,
  SceneNpcEntity,
  SessionEventEntity,

  GameSessionEntity,
  SessionNpcStateEntity,
  SessionFactionStateEntity,
  SessionStoryArcStateEntity,
  CompanionTemplateEntity,
} from "src/entities";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { QuestDefeatListener } from "src/common/event-bus/listeners/quest-defeat.listener";
import { GainReputationListener } from "src/common/event-bus/listeners/gain-reputation.listener";
import { QuestRewardListener } from "src/common/event-bus/listeners/quest-reward.listener";
import { AuthModule } from "../auth/auth.module";
import { AiProxyModule } from "../ai-proxy/ai-proxy.module";
import { WorldController } from "./world.controller";
import { WorldSynthController } from "./world-synth.controller";
import { SessionScopedWorldController } from "./session-scoped.controller";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { CampaignService } from "./services/campaign.service";
import { LocationService } from "./services/location.service";
import { LocationPoiService } from "./services/location-poi.service";
import { NpcService } from "./services/npc.service";
import { FactionService } from "./services/faction.service";
import { QuestService } from "./services/quest.service";
import { PhaseService } from "./services/phase.service";
import { StoryArcService } from "./services/story-arc.service";
import { MissionPullListener } from "./listeners/mission-pull.listener";
import { MissionPanelCacheListener } from "./listeners/mission-panel-cache.listener";
import { PhaseGateListener } from "./listeners/phase-gate.listener";
import { NpcRelationshipService } from "./services/npc-relationship.service";

import { AmbianceService } from "./services/ambiance.service";
import { WeatherService } from "./services/weather.service";
import { GameClockService } from "./services/game-clock.service";
import { ChaosFactorService } from "./services/chaos-factor.service";
import { SessionNpcStateService } from "./services/session-npc-state.service";
import { SessionFactionStateService } from "./services/session-faction-state.service";
import { SessionStoryArcStateService } from "./services/session-story-arc-state.service";
import { NpcWealthService } from "./services/npc-wealth.service";
import { NpcWealthController } from "./npc-wealth.controller";
import { CompanionTemplatesController } from "./companion-templates.controller";
import { CompanionTemplateService } from "./services/companion-template.service";
import { CampaignIdPipe } from "./pipes/campaign-id.pipe";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CampaignEntity,
      CampaignPlayerEntity,
      LocationEntity,
      LocationPoiEntity,
      LocationConnectionEntity,
      NpcEntity,
      NpcArchetypeTemplateEntity,
      NpcRelationshipEntity,
      NpcStoryHookEntity,
      FactionEntity,
      FactionRelationEntity,
      StoryArcEntity,
      PhaseEntity,
      PhaseTransitionEntity,
      QuestEntity,
      QuestObjectiveEntity,
      QuestPrerequisiteEntity,
      LootTableEntity,
      LootTableItemEntity,
      EncounterTemplateEntity,
      UserEntity,
      CharacterEntity,
      CharacterStateEntity,
      MonsterEntity,
      EquipmentEntity,
      MagicItemEntity,

      WeatherEntity,
      GameClockEntity,
      ClockEntity,
      SceneEntity,
      SceneNpcEntity,
      SessionEventEntity,
      GameSessionEntity,
      SessionNpcStateEntity,
      SessionFactionStateEntity,
      SessionStoryArcStateEntity,
      EncounterEntity,
      EncounterParticipantEntity,
      EventListenerProcessedEntity,
      CompanionTemplateEntity,
    ]),
    AuthModule,
    forwardRef(() => AiProxyModule),
    forwardRef(() => GameEngineModule),
  ],
  controllers: [
    WorldController,
    WorldSynthController,
    SessionScopedWorldController,
    NpcWealthController,
    CompanionTemplatesController,
  ],
  providers: [
    CampaignService,
    LocationService,
    LocationPoiService,
    NpcService,
    FactionService,
    QuestService,
    PhaseService,
    StoryArcService,
    NpcRelationshipService,

    AmbianceService,
    WeatherService,
    GameClockService,
    ChaosFactorService,

    SessionNpcStateService,
    SessionFactionStateService,
    SessionStoryArcStateService,
    NpcWealthService,
    CompanionTemplateService,

    CampaignIdPipe,
    QuestDefeatListener,
    GainReputationListener,
    QuestRewardListener,
    MissionPullListener,
    MissionPanelCacheListener,
    PhaseGateListener,
  ],
  exports: [
    CampaignService,
    LocationService,
    LocationPoiService,
    NpcService,
    FactionService,
    QuestService,
    PhaseService,
    StoryArcService,
    NpcRelationshipService,

    AmbianceService,
    WeatherService,
    GameClockService,
    ChaosFactorService,

    SessionNpcStateService,
    SessionFactionStateService,
    SessionStoryArcStateService,
    NpcWealthService,
    CompanionTemplateService,
  ],
})
export class WorldModule implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly questDefeatListener: QuestDefeatListener,
    private readonly gainReputationListener: GainReputationListener,
    private readonly questRewardListener: QuestRewardListener,
    private readonly missionPullListener: MissionPullListener,
    private readonly missionPanelCacheListener: MissionPanelCacheListener,
    private readonly phaseGateListener: PhaseGateListener,
  ) {}

  onModuleInit(): void {
    this.eventBus.registerListener(this.questDefeatListener);
    this.eventBus.registerListener(this.gainReputationListener);
    this.eventBus.registerListener(this.questRewardListener);
    this.eventBus.registerListener(this.missionPullListener);
    this.eventBus.registerListener(this.missionPanelCacheListener);
    this.eventBus.registerListener(this.phaseGateListener);
  }
}
