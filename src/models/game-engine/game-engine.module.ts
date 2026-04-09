import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GameSessionEntity,
  EncounterEntity,
  EncounterParticipantEntity,
  GameEventEntity,
  MonsterEntity,
  CharacterEntity,
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GameSessionEntity,
      EncounterEntity,
      EncounterParticipantEntity,
      GameEventEntity,
      MonsterEntity,
      CharacterEntity,
    ]),
    AuthModule,
    CharactersModule,
  ],
  controllers: [GameEngineController],
  providers: [
    DiceService,
    ConditionEffectsService,
    EventService,
    SessionService,
    EncounterService,
    CombatService,
  ],
  exports: [
    DiceService,
    ConditionEffectsService,
    CombatService,
    EncounterService,
    SessionService,
    EventService,
  ],
})
export class GameEngineModule {}
