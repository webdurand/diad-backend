import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GameSessionEntity,
  EncounterEntity,
  EncounterParticipantEntity,
  EncounterJoinRequestEntity,
  PersistentAreaEffectEntity,
  GameEventEntity,
  MonsterEntity,
  CharacterEntity,
  LootTableEntity,
  LootTableItemEntity,
  SpellEntity,
  CampaignEntity,
  CampaignPlayerEntity,
  UserEntity,
} from 'src/entities';
import { AuthModule } from '../auth/auth.module';
import { CharactersModule } from '../characters/characters.module';
import { GameEngineController } from './game-engine.controller';
import { DiceService } from './services/dice.service';
import { ConditionEffectsService } from './services/condition-effects.service';
import { EventService } from './services/event.service';
import { SessionService } from './services/session.service';
import { EncounterService } from './services/encounter.service';
import { CombatService } from './services/combat.service';
import { SkillCheckService } from './services/skill-check.service';
import { SavingThrowService } from './services/saving-throw.service';
import { SpellCastingService } from './services/spell-casting.service';
import { MovementService } from './services/movement.service';
import { LootService } from './services/loot.service';
import { MonsterActionResolver } from './services/monster-action-resolver.service';
import { PermissionResolver } from './services/permission-resolver.service';
import { MonsterSpellcastingService } from './services/monster-spellcasting.service';
import { GenericActionsService } from './services/generic-actions.service';
import { EncounterSnapshotService } from './services/encounter-snapshot.service';
import { AiTurnService } from './services/ai-turn.service';
import { AiTurnExecutor } from './services/ai-turn-executor.interface';
import { MockAiTurnExecutor } from './services/mock-ai-turn.executor';
import { RemoteAgentExecutor } from './services/remote-agent.executor';
// Spec 004 — completude RAW
import { ConcentrationService } from './services/concentration.service';
import { ConditionLifecycleService } from './services/condition-lifecycle.service';
import { DamageResistanceService } from './services/damage-resistance.service';
import { ExhaustionService } from './services/exhaustion.service';
import { LegendaryActionService } from './services/legendary-action.service';
import { LairActionService } from './services/lair-action.service';
import { PersistentAreaService } from './services/persistent-area.service';
import { GrappleEscapeService } from './services/grapple-escape.service';
import { StartTurnOrchestratorService } from './services/start-turn-orchestrator.service';
import { EffectInstanceService } from './services/effect-instance.service';
import { AiProxyModule } from '../ai-proxy/ai-proxy.module';
import { CloudinaryService } from 'src/shared/cloudinary.service';
import { WorldModule } from '../world/world.module';
// Spec 002 — realtime + join-request loop
import { RealtimeModule } from 'src/realtime/realtime.module';
import { RoomAuthorizerRegistry } from 'src/realtime/room-authorizer.registry';
import { EncounterRoomAuthorizer } from './authorizers/encounter-room.authorizer';
import { JoinRequestService } from './services/join-request.service';
// Spec 003 — Combat Action Registry (módulo extraído para evitar circular)
import { CombatActionsModule } from '../combat-actions/combat-actions.module';
import { ClassFeatureExecutorService } from './services/class-feature-executor.service';

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
      LootTableEntity,
      LootTableItemEntity,
      SpellEntity,
      CampaignEntity,
      CampaignPlayerEntity,
      UserEntity,
    ]),
    AuthModule,
    CharactersModule,
    WorldModule,
    AiProxyModule,
    RealtimeModule,
    CombatActionsModule,
  ],
  controllers: [GameEngineController],
  providers: [
    DiceService,
    ConditionEffectsService,
    EventService,
    SessionService,
    EncounterService,
    CombatService,
    SkillCheckService,
    SavingThrowService,
    SpellCastingService,
    MovementService,
    LootService,
    MonsterActionResolver,
    PermissionResolver,
    MonsterSpellcastingService,
    GenericActionsService,
    EncounterSnapshotService,
    AiTurnService,
    // Spec 003 T048 — binding condicional do AiTurnExecutor.
    // Em testes (NODE_ENV=test) usa Mock; prod/dev usa RemoteAgentExecutor.
    {
      provide: AiTurnExecutor,
      useClass:
        process.env.NODE_ENV === 'test'
          ? MockAiTurnExecutor
          : RemoteAgentExecutor,
    },
    MockAiTurnExecutor,
    RemoteAgentExecutor,
    CloudinaryService,
    // Spec 004
    ConcentrationService,
    ConditionLifecycleService,
    DamageResistanceService,
    ExhaustionService,
    LegendaryActionService,
    LairActionService,
    PersistentAreaService,
    GrappleEscapeService,
    StartTurnOrchestratorService,
    EffectInstanceService,
    // Spec 002
    JoinRequestService,
    EncounterRoomAuthorizer,
    // Spec 003 Fatia 7 — class features executor
    ClassFeatureExecutorService,
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
    // Spec 004 — exportados para uso por hooks externos (combat, spell-casting)
    ConcentrationService,
    ConditionLifecycleService,
    DamageResistanceService,
    ExhaustionService,
    LegendaryActionService,
    LairActionService,
    PersistentAreaService,
    GrappleEscapeService,
    StartTurnOrchestratorService,
    EffectInstanceService,
    // Spec 002
    JoinRequestService,
  ],
})
export class GameEngineModule implements OnModuleInit {
  constructor(
    private readonly authorizerRegistry: RoomAuthorizerRegistry,
    private readonly encounterAuthorizer: EncounterRoomAuthorizer,
  ) {}

  onModuleInit(): void {
    // Imperative registration: NestJS multi-providers don't cross module
    // boundaries, so each domain module registers its authorizers at init.
    this.authorizerRegistry.register(this.encounterAuthorizer);
  }
}
