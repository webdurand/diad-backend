import { forwardRef, Module, OnModuleInit } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  GameSessionEntity,
  EncounterEntity,
  EncounterParticipantEntity,
  EncounterJoinRequestEntity,
  PersistentAreaEffectEntity,
  GameEventEntity,
  MonsterEntity,
  CharacterEntity,
  CharacterStateEntity,
  CharacterClassEntity,
  LootTableEntity,
  LootTableItemEntity,
  SpellEntity,
  CampaignEntity,
  CampaignPlayerEntity,
  CampaignPartyMemberEntity,
  FactionEntity,
  StoryArcEntity,
  PhaseEntity,
  PhaseTransitionEntity,
  QuestEntity,
  QuestObjectiveEntity,
  SessionStoryArcStateEntity,
  SessionEventEntity,
  UserEntity,
  CharacterEquipmentEntity,
} from "src/entities";
import { AuthModule } from "../auth/auth.module";
import { CharactersModule } from "../characters/characters.module";
import { GameEngineController } from "./game-engine.controller";
import { DiceService } from "./services/dice.service";
import { ConditionEffectsService } from "./services/condition-effects.service";
import { EventService } from "./services/event.service";
import { SessionService } from "./services/session.service";
import { EncounterService } from "./services/encounter.service";
import { CombatService } from "./services/combat.service";
import { SkillCheckService } from "./services/skill-check.service";
import { SavingThrowService } from "./services/saving-throw.service";
import { InspirationService } from "./services/inspiration.service";
import { SpellCastingService } from "./services/spell-casting.service";
import { MovementService } from "./services/movement.service";
import { LootService } from "./services/loot.service";
import { MonsterActionResolver } from "./services/monster-action-resolver.service";
import { PermissionResolver } from "./services/permission-resolver.service";
import { EncounterEndDetectorService } from "./services/encounter-end-detector.service";
import { MonsterSpellcastingService } from "./services/monster-spellcasting.service";
import { GenericActionsService } from "./services/generic-actions.service";
import { EncounterSnapshotService } from "./services/encounter-snapshot.service";
import { AiTurnService } from "./services/ai-turn.service";
import { AiTurnExecutor } from "./services/ai-turn-executor.interface";
import { MockAiTurnExecutor } from "./services/mock-ai-turn.executor";
import { RemoteAgentExecutor } from "./services/remote-agent.executor";

import { ConcentrationService } from "./services/concentration.service";
import { ConditionLifecycleService } from "./services/condition-lifecycle.service";
import { DamageResistanceService } from "./services/damage-resistance.service";
import { ExhaustionService } from "./services/exhaustion.service";
import { LegendaryActionService } from "./services/legendary-action.service";
import { LairActionService } from "./services/lair-action.service";
import { LairActionsCoordinator } from "./services/lair-actions-coordinator.service";
import { LegendaryActionsCoordinator } from "./services/legendary-actions-coordinator.service";
import { MonsterReactionService } from "./services/monster-reaction.service";
import { PersistentAreaService } from "./services/persistent-area.service";
import { GrappleEscapeService } from "./services/grapple-escape.service";
import { StartTurnOrchestratorService } from "./services/start-turn-orchestrator.service";
import { EffectInstanceService } from "./services/effect-instance.service";
import { ClassFeatureResolverService } from "./services/class-feature-resolver.service";

import { WeaponMasteryService } from "./services/weapon-mastery.service";

import { FightingStyleService } from "./services/fighting-style.service";

import { FightingStyleReactionsService } from "./services/fighting-style-reactions.service";

import { TacticalFeaturesService } from "./services/tactical-features.service";

import { BattleMasterService } from "./services/battle-master.service";

import { BrutalStrikeService } from "./services/brutal-strike.service";

import { BarbarianFeaturesService } from "./services/barbarian-features.service";

import { BerserkerService } from "./services/berserker.service";

import { ClericFeaturesService } from "./services/cleric-features.service";

import { PaladinFeaturesService } from "./services/paladin-features.service";

import { SorcererFeaturesService } from "./services/sorcerer-features.service";

import { BardFeaturesService } from "./services/bard-features.service";

import { TransformationService } from "./services/transformation.service";

import { SummoningService } from "./services/summoning.service";

import { MarkTransferService } from "./services/mark-transfer.service";

import { OpportunityAttackService } from "./services/opportunity-attack.service";
import { ReadyActionService } from "./services/ready-action.service";
import { AarakocraRitualService } from "./services/aarakocra-ritual.service";

import { ReactionOpportunityService } from "./services/reaction-opportunity.service";

import { CapstonesService } from "./services/capstones.service";
import { AiProxyModule } from "../ai-proxy/ai-proxy.module";
import { CloudinaryService } from "src/shared/cloudinary.service";
import { WorldModule } from "../world/world.module";
import { SessionModule } from "../session/session.module";

import { RealtimeModule } from "src/realtime/realtime.module";
import { RoomAuthorizerRegistry } from "src/realtime/room-authorizer.registry";
import { EncounterRoomAuthorizer } from "./authorizers/encounter-room.authorizer";
import { JoinRequestService } from "./services/join-request.service";

import { CombatActionsModule } from "../combat-actions/combat-actions.module";
import { ClassFeatureExecutorService } from "./services/class-feature-executor.service";

import {
  RestSessionEntity,
  RestEventTemplateEntity,
  ReactionDefaultEntity,
  XpAwardEventEntity,
} from "src/entities";
import { RestService } from "./services/rest.service";
import { XpAwardService } from "./services/xp-award.service";
import { FateLadderService } from "./services/fate-ladder.service";
import { RestEventPickerService } from "./services/rest-event-picker.service";

import { DiceRollService } from "./services/dice-roll.service";

import { RevivifyCheckService } from "./services/revivify-check.service";
import { DyingStateService } from "./services/dying-state.service";
import { LootRollService } from "./services/loot-roll.service";
import { MagicItemSelectorService } from "./services/magic-item-selector.service";
import { MonsterSelectorService } from "./services/monster-selector.service";
import { RandomEncounterMaterializerService } from "./services/random-encounter-materializer.service";
import { RandomEncounterController } from "./controllers/random-encounter.controller";
import { ToolEventEmitService } from "./services/tool-event-emit.service";
import { StartEncounterFromNarrativeService } from "./services/start-encounter-from-narrative.service";
import { SceneEntity } from "src/entities/scene.entity";
import { SceneNpcEntity } from "src/entities/scene-npc.entity";
import { NpcEntity } from "src/entities/npc.entity";
import { SessionMessageEntity } from "src/entities/session-message.entity";
import { MagicItemEntity } from "src/entities/magic-item.entity";
import { LocationEntity } from "src/entities/location.entity";
import { LocationPoiEntity } from "src/entities/location-poi.entity";
import { LocationConnectionEntity } from "src/entities/location-connection.entity";
import { SessionNpcStateEntity } from "src/entities/session-npc-state.entity";
import { NpcStoryHookEntity } from "src/entities/npc-story-hook.entity";
import { MetaQueryAuditEntity } from "src/entities/meta-query-audit.entity";
import { ScenePoiObservationEntity } from "src/entities/scene-poi-observation.entity";
import { MoveToLocationService } from "./services/move-to-location.service";
import { MoveToPoiService } from "./services/move-to-poi.service";
import { TravelTickService } from "./services/travel-tick.service";
import { TravelActionService } from "./services/travel-action.service";
import { DialogueActionService } from "./services/dialogue-action.service";
import { DialogueActionGeneratorService } from "./services/dialogue-action-generator.service";
import { OpenModeActionGeneratorService } from "./services/open-mode-action-generator.service";
import { ScenePoiObservationService } from "./services/scene-poi-observation.service";
import { EncounterDifficultyPolicyService } from "./services/encounter-difficulty-policy.service";
import { PaladinAuraService } from "./services/paladin-aura.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GameSessionEntity,
      EncounterEntity,
      EncounterParticipantEntity,
      EncounterJoinRequestEntity,
      PersistentAreaEffectEntity,
      GameEventEntity,
      MonsterEntity,
      CharacterEntity,
      CharacterStateEntity,
      CharacterClassEntity,
      CharacterEquipmentEntity,

      LootTableEntity,
      LootTableItemEntity,
      SpellEntity,
      CampaignEntity,
      CampaignPlayerEntity,
      CampaignPartyMemberEntity,
      FactionEntity,
      StoryArcEntity,
      PhaseEntity,
      PhaseTransitionEntity,
      QuestEntity,
      QuestObjectiveEntity,
      SessionStoryArcStateEntity,
      SessionEventEntity,
      UserEntity,

      RestSessionEntity,
      RestEventTemplateEntity,
      ReactionDefaultEntity,
      XpAwardEventEntity,

      SceneEntity,
      SceneNpcEntity,
      NpcEntity,
      SessionMessageEntity,
      MagicItemEntity,
      LocationEntity,
      LocationPoiEntity,
      LocationConnectionEntity,
      SessionNpcStateEntity,
      NpcStoryHookEntity,
      MetaQueryAuditEntity,
      ScenePoiObservationEntity,
    ]),
    AuthModule,
    CharactersModule,
    forwardRef(() => WorldModule),
    SessionModule,
    forwardRef(() => AiProxyModule),
    RealtimeModule,
    CombatActionsModule,
  ],
  controllers: [GameEngineController, RandomEncounterController],
  providers: [
    DiceService,
    ConditionEffectsService,
    EventService,
    SessionService,
    EncounterService,
    CombatService,
    SkillCheckService,
    SavingThrowService,
    InspirationService,
    SpellCastingService,
    MovementService,
    LootService,
    MonsterActionResolver,
    PermissionResolver,
    MonsterSpellcastingService,
    GenericActionsService,
    EncounterSnapshotService,
    AiTurnService,


    {
      provide: AiTurnExecutor,
      useClass:
        process.env.NODE_ENV === "test"
          ? MockAiTurnExecutor
          : RemoteAgentExecutor,
    },
    MockAiTurnExecutor,
    RemoteAgentExecutor,
    CloudinaryService,

    ConcentrationService,
    ConditionLifecycleService,
    DamageResistanceService,
    ExhaustionService,
    LegendaryActionService,
    LegendaryActionsCoordinator,
    LairActionService,
    LairActionsCoordinator,
    MonsterReactionService,
    PersistentAreaService,
    GrappleEscapeService,
    StartTurnOrchestratorService,
    EffectInstanceService,
    ClassFeatureResolverService,

    WeaponMasteryService,

    FightingStyleService,

    FightingStyleReactionsService,

    TacticalFeaturesService,

    BattleMasterService,
    BrutalStrikeService,
    BarbarianFeaturesService,
    BerserkerService,
    ClericFeaturesService,
    PaladinFeaturesService,
    PaladinAuraService,
    SorcererFeaturesService,
    TransformationService,
    SummoningService,
    BardFeaturesService,

    MarkTransferService,

    OpportunityAttackService,
    ReadyActionService,
    AarakocraRitualService,

    ReactionOpportunityService,

    CapstonesService,

    JoinRequestService,
    EncounterRoomAuthorizer,

    ClassFeatureExecutorService,

    RestService,
    XpAwardService,
    FateLadderService,
    RestEventPickerService,

    DiceRollService,

    RevivifyCheckService,
    DyingStateService,
    LootRollService,
    MagicItemSelectorService,
    MonsterSelectorService,
    RandomEncounterMaterializerService,
    ToolEventEmitService,
    StartEncounterFromNarrativeService,

    EncounterEndDetectorService,
    MoveToLocationService,
    MoveToPoiService,
    TravelTickService,
    TravelActionService,
    DialogueActionService,
    DialogueActionGeneratorService,
    OpenModeActionGeneratorService,
    ScenePoiObservationService,
    EncounterDifficultyPolicyService,
  ],
  exports: [
    DiceService,
    ConditionEffectsService,
    CombatService,
    EncounterService,
    MovementService,
    SessionService,
    EventService,
    SkillCheckService,
    SavingThrowService,
    SpellCastingService,
    LootService,
    MonsterActionResolver,
    PermissionResolver,
    MonsterSpellcastingService,
    GenericActionsService,
    EncounterSnapshotService,
    AiTurnService,

    ConcentrationService,
    ConditionLifecycleService,
    DamageResistanceService,
    ExhaustionService,
    LegendaryActionService,
    LegendaryActionsCoordinator,
    LairActionService,
    LairActionsCoordinator,
    PersistentAreaService,
    GrappleEscapeService,
    StartTurnOrchestratorService,
    EffectInstanceService,
    ClassFeatureResolverService,

    WeaponMasteryService,
    FightingStyleService,

    FightingStyleReactionsService,

    TacticalFeaturesService,

    BattleMasterService,
    BrutalStrikeService,
    BarbarianFeaturesService,
    BerserkerService,
    ClericFeaturesService,
    PaladinFeaturesService,
    SorcererFeaturesService,
    TransformationService,
    SummoningService,
    BardFeaturesService,

    MarkTransferService,

    OpportunityAttackService,
    ReadyActionService,
    AarakocraRitualService,

    ReactionOpportunityService,

    CapstonesService,

    JoinRequestService,

    FateLadderService,
    XpAwardService,
    RestEventPickerService,
    RestService,

    DiceRollService,
    StartEncounterFromNarrativeService,
    RandomEncounterMaterializerService,
    MonsterSelectorService,
    DialogueActionGeneratorService,
    OpenModeActionGeneratorService,
    EncounterDifficultyPolicyService,
  ],
})
export class GameEngineModule implements OnModuleInit {
  constructor(
    private readonly authorizerRegistry: RoomAuthorizerRegistry,
    private readonly encounterAuthorizer: EncounterRoomAuthorizer,
  ) {}

  onModuleInit(): void {


    this.authorizerRegistry.register(this.encounterAuthorizer);
  }
}
