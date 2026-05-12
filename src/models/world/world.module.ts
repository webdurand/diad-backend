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
  FactionEntity,
  FactionRelationEntity,
  LocationPoiEntity,
  StoryArcEntity,
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
  // Spec 019
  WeatherEntity,
  GameClockEntity,
  ClockEntity,
  SceneEntity,
  SceneNpcEntity,
  // Adventure-scope split
  GameSessionEntity,
  SessionNpcStateEntity,
  SessionFactionStateEntity,
  SessionStoryArcStateEntity,
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
import { StoryArcService } from "./services/story-arc.service";
import { NpcRelationshipService } from "./services/npc-relationship.service";
// Spec 019 — Living World & Ambiance
import { AmbianceService } from "./services/ambiance.service";
import { WeatherService } from "./services/weather.service";
import { GameClockService } from "./services/game-clock.service";
import { ChaosFactorService } from "./services/chaos-factor.service";
import { SessionNpcStateService } from "./services/session-npc-state.service";
import { SessionFactionStateService } from "./services/session-faction-state.service";
import { SessionStoryArcStateService } from "./services/session-story-arc-state.service";
import { NpcWealthService } from "./services/npc-wealth.service";
import { NpcWealthController } from "./npc-wealth.controller";
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
      CharacterStateEntity,
      MonsterEntity,
      EquipmentEntity,
      MagicItemEntity,
      // Spec 019
      WeatherEntity,
      GameClockEntity,
      ClockEntity,
      SceneEntity,
      SceneNpcEntity,
      GameSessionEntity,
      SessionNpcStateEntity,
      SessionFactionStateEntity,
      SessionStoryArcStateEntity,
      EncounterEntity,
      EncounterParticipantEntity,
      EventListenerProcessedEntity,
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
  ],
  providers: [
    CampaignService,
    LocationService,
    LocationPoiService,
    NpcService,
    FactionService,
    QuestService,
    StoryArcService,
    NpcRelationshipService,
    // Spec 019 — Living World & Ambiance
    AmbianceService,
    WeatherService,
    GameClockService,
    ChaosFactorService,
    // Adventure-scope split
    SessionNpcStateService,
    SessionFactionStateService,
    SessionStoryArcStateService,
    NpcWealthService,
    // Spec 027 D3 — slug→UUID pipe pra `/campaigns/:id/*`
    CampaignIdPipe,
    QuestDefeatListener,
    GainReputationListener,
    QuestRewardListener,
  ],
  exports: [
    CampaignService,
    LocationService,
    LocationPoiService,
    NpcService,
    FactionService,
    QuestService,
    StoryArcService,
    NpcRelationshipService,
    // Spec 019
    AmbianceService,
    WeatherService,
    GameClockService,
    ChaosFactorService,
    // Adventure-scope split
    SessionNpcStateService,
    SessionFactionStateService,
    SessionStoryArcStateService,
    NpcWealthService,
  ],
})
export class WorldModule implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly questDefeatListener: QuestDefeatListener,
    private readonly gainReputationListener: GainReputationListener,
    private readonly questRewardListener: QuestRewardListener,
  ) {}

  onModuleInit(): void {
    this.eventBus.registerListener(this.questDefeatListener);
    this.eventBus.registerListener(this.gainReputationListener);
    this.eventBus.registerListener(this.questRewardListener);
  }
}
