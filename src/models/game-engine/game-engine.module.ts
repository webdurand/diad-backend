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
    ]),
    AuthModule,
    CharactersModule,
    WorldModule,
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
  ],
})
export class GameEngineModule {}
