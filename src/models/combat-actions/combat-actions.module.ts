import { Module } from '@nestjs/common';
import { CombatActionRegistry } from '../game-engine/services/combat-action-registry.service';
import { GenericActionResolver } from '../game-engine/services/action-resolvers/generic-action.resolver';
import { UnarmedStrikeResolver } from '../game-engine/services/action-resolvers/unarmed-strike.resolver';
import { WeaponActionResolver } from '../game-engine/services/action-resolvers/weapon-action.resolver';
import { MonsterActionAdapterResolver } from '../game-engine/services/action-resolvers/monster-action-adapter.resolver';
import { ClassFeatureActionResolver } from '../game-engine/services/action-resolvers/class-feature.resolver';
import { ACTION_RESOLVERS } from '../game-engine/services/action-resolvers/action-resolver.interface';

/**
 * Spec 003 — Combat Action Registry module.
 *
 * Módulo independente que agrupa o registry + resolvers. Exportado tanto para
 * `CharactersModule` (expõe `GET /characters/:id/combat-actions`) quanto para
 * `GameEngineModule` (usa em `/attack`, `/generic-action`, `/encounters/:id/participants/:pid/actions`).
 *
 * Extraído daqui pra evitar dependência circular entre Characters ↔ GameEngine.
 */
@Module({
  providers: [
    GenericActionResolver,
    UnarmedStrikeResolver,
    WeaponActionResolver,
    MonsterActionAdapterResolver,
    ClassFeatureActionResolver,
    {
      provide: ACTION_RESOLVERS,
      useFactory: (
        generic: GenericActionResolver,
        unarmed: UnarmedStrikeResolver,
        weapon: WeaponActionResolver,
        monster: MonsterActionAdapterResolver,
        features: ClassFeatureActionResolver,
      ) => [weapon, unarmed, features, monster, generic] as const,
      inject: [
        GenericActionResolver,
        UnarmedStrikeResolver,
        WeaponActionResolver,
        MonsterActionAdapterResolver,
        ClassFeatureActionResolver,
      ],
    },
    CombatActionRegistry,
  ],
  exports: [CombatActionRegistry],
})
export class CombatActionsModule {}
