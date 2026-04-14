import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GameSessionEntity,
  EncounterEntity,
  EncounterParticipantEntity,
  GameEventEntity,
  MonsterEntity,
  CharacterEntity,
  LootTableEntity,
  LootTableItemEntity,
  SpellEntity,
  CampaignEntity,
  CampaignPlayerEntity,
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
import { AiProxyModule } from '../ai-proxy/ai-proxy.module';
import { CloudinaryService } from 'src/shared/cloudinary.service';
import { WorldModule } from '../world/world.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GameSessionEntity,
      EncounterEntity,
      EncounterParticipantEntity,
      GameEventEntity,
      MonsterEntity,
      CharacterEntity,
      LootTableEntity,
      LootTableItemEntity,
      SpellEntity,
      CampaignEntity,
      CampaignPlayerEntity,
    ]),
    AuthModule,
    CharactersModule,
    WorldModule,
    AiProxyModule,
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
  ],
})
export class GameEngineModule {}
