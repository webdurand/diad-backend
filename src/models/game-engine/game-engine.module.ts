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
  UserEntity,
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
// Spec 004 — completude RAW
import { ConcentrationService } from "./services/concentration.service";
import { ConditionLifecycleService } from "./services/condition-lifecycle.service";
import { DamageResistanceService } from "./services/damage-resistance.service";
import { ExhaustionService } from "./services/exhaustion.service";
import { LegendaryActionService } from "./services/legendary-action.service";
import { LairActionService } from "./services/lair-action.service";
import { PersistentAreaService } from "./services/persistent-area.service";
import { GrappleEscapeService } from "./services/grapple-escape.service";
import { StartTurnOrchestratorService } from "./services/start-turn-orchestrator.service";
import { EffectInstanceService } from "./services/effect-instance.service";
import { ClassFeatureResolverService } from "./services/class-feature-resolver.service";
// Spec 012 Fase 0 — Weapon Mastery (XPHB 2024)
import { WeaponMasteryService } from "./services/weapon-mastery.service";
// Spec 012 Fase 0 — Fighting Style (XPHB 2024)
import { FightingStyleService } from "./services/fighting-style.service";
// Spec 012 Fighter 100% — Fighting Style Tier B reactions (Interception/Protection)
import { FightingStyleReactionsService } from "./services/fighting-style-reactions.service";
// Spec 012 Fighter 100% — Tactical trio (Mind L2, Master L9; Shift L5 em handleSecondWind)
import { TacticalFeaturesService } from "./services/tactical-features.service";
// Spec 012 Fighter 100% — Battle Master (Combat Superiority + maneuvers)
import { BattleMasterService } from "./services/battle-master.service";
// Spec 012 Barbarian 100% — Brutal Strike L9 (Forceful/Hamstring)
import { BrutalStrikeService } from "./services/brutal-strike.service";
// Spec 012 Barbarian 100% — Relentless Rage L11 + Indomitable Might L18
import { BarbarianFeaturesService } from "./services/barbarian-features.service";
// Spec 012 Barbarian 100% — Berserker subclass (Frenzy, Retaliation, Intimidating Presence)
import { BerserkerService } from "./services/berserker.service";
// Spec 012 Cleric 100% — Sear Undead L5 + Divine Intervention L10
import { ClericFeaturesService } from "./services/cleric-features.service";
// Spec 012 Paladin 100% — Divine Smite + Radiant Strikes + Sacred Weapon
import { PaladinFeaturesService } from "./services/paladin-features.service";
// Spec 012 Sorcerer — Font of Magic (SP pool + convert SP↔slot)
import { SorcererFeaturesService } from "./services/sorcerer-features.service";
// Spec 012 Bard — Bardic Inspiration + Cutting Words (Lore)
import { BardFeaturesService } from "./services/bard-features.service";
// Spec 012 Druid + genérico — Transformation pipeline (Wild Shape, Polymorph, Form of Dread, ...)
import { TransformationService } from "./services/transformation.service";
// Spec 012 Druid + genérico — Summoning pipeline (Summon Beast, Conjure Animals, Spiritual Weapon, Familiar, ...)
import { SummoningService } from "./services/summoning.service";
// Spec 012 Lote B — Hunter's Mark / Hex transfer (RAW 2024 XPHB)
import { MarkTransferService } from "./services/mark-transfer.service";
// Spec 012 Lote B — Opportunity Attacks (reaction window, RAW 2024 XPHB)
import { OpportunityAttackService } from "./services/opportunity-attack.service";
// Spec 015 Eixo 7 — Reaction opportunities (Shield, Counterspell, Cutting Words)
import { ReactionOpportunityService } from "./services/reaction-opportunity.service";
// Spec 012 Lote C — Capstones L18-L20 (start-of-combat hooks RAW 2024 XPHB)
import { CapstonesService } from "./services/capstones.service";
import { AiProxyModule } from "../ai-proxy/ai-proxy.module";
import { CloudinaryService } from "src/shared/cloudinary.service";
import { WorldModule } from "../world/world.module";
// Spec 002 — realtime + join-request loop
import { RealtimeModule } from "src/realtime/realtime.module";
import { RoomAuthorizerRegistry } from "src/realtime/room-authorizer.registry";
import { EncounterRoomAuthorizer } from "./authorizers/encounter-room.authorizer";
import { JoinRequestService } from "./services/join-request.service";
// Spec 003 — Combat Action Registry (módulo extraído para evitar circular)
import { CombatActionsModule } from "../combat-actions/combat-actions.module";
import { ClassFeatureExecutorService } from "./services/class-feature-executor.service";
// Spec 016 — Play Shell Foundation (M0 stubs; M3/M4/M5 implement)
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
// Spec 016 M2 — Dice request lifecycle (active checks via SSE)
import { DiceRollService } from "./services/dice-roll.service";
// Spec 020 — Tool Surface Completion
import { RevivifyCheckService } from "./services/revivify-check.service";
import { DyingStateService } from "./services/dying-state.service";
import { LootRollService } from "./services/loot-roll.service";
import { ToolEventEmitService } from "./services/tool-event-emit.service";
import { StartEncounterFromNarrativeService } from "./services/start-encounter-from-narrative.service";
import { SceneEntity } from "src/entities/scene.entity";
import { NpcEntity } from "src/entities/npc.entity";

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
      CharacterClassEntity, // Spec 012 — ConditionLifecycleService usa pra checar Land Druid L10+ immunity
      // CharacterStateEntity já declarado acima; mantém pra injeção no ClassFeatureResolverService
      LootTableEntity,
      LootTableItemEntity,
      SpellEntity,
      CampaignEntity,
      CampaignPlayerEntity,
      UserEntity,
      // Spec 016 — Play Shell Foundation
      RestSessionEntity,
      RestEventTemplateEntity,
      ReactionDefaultEntity,
      XpAwardEventEntity,
      // Spec 020 — start_encounter_from_narrative
      SceneEntity,
      NpcEntity,
    ]),
    AuthModule,
    CharactersModule,
    WorldModule,
    forwardRef(() => AiProxyModule),
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
    // Spec 003 T048 — binding condicional do AiTurnExecutor.
    // Em testes (NODE_ENV=test) usa Mock; prod/dev usa RemoteAgentExecutor.
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
    ClassFeatureResolverService,
    // Spec 012 Fase 0 — Weapon Mastery
    WeaponMasteryService,
    // Spec 012 Fase 0 — Fighting Style
    FightingStyleService,
    // Spec 012 Fighter 100% — FS Tier B reactions (Interception, Protection)
    FightingStyleReactionsService,
    // Spec 012 Fighter 100% — Tactical trio
    TacticalFeaturesService,
    // Spec 012 Fighter 100% — Battle Master
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
    // Spec 012 Lote B — Mark transfer
    MarkTransferService,
    // Spec 012 Lote B — Opportunity Attacks
    OpportunityAttackService,
    // Spec 015 Eixo 7 — Reaction opportunities (Shield, Counterspell, ...)
    ReactionOpportunityService,
    // Spec 012 Lote C — Capstones
    CapstonesService,
    // Spec 002
    JoinRequestService,
    EncounterRoomAuthorizer,
    // Spec 003 Fatia 7 — class features executor
    ClassFeatureExecutorService,
    // Spec 016 — Play Shell Foundation (M0 stubs; M3/M4/M5 wire)
    RestService,
    XpAwardService,
    FateLadderService,
    RestEventPickerService,
    // Spec 016 M2 — Dice request lifecycle
    DiceRollService,
    // Spec 020 — Tool Surface Completion
    RevivifyCheckService,
    DyingStateService,
    LootRollService,
    ToolEventEmitService,
    StartEncounterFromNarrativeService,
    // Spec 027 (M2 follow-up) — auto-end de combate em DIAD solo
    EncounterEndDetectorService,
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
    ClassFeatureResolverService,
    // Spec 012 Fase 0
    WeaponMasteryService,
    FightingStyleService,
    // Spec 012 Fighter 100% — FS Tier B reactions
    FightingStyleReactionsService,
    // Spec 012 Fighter 100% — Tactical trio
    TacticalFeaturesService,
    // Spec 012 Fighter 100% — Battle Master
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
    // Spec 012 Lote B — Mark transfer
    MarkTransferService,
    // Spec 012 Lote B — Opportunity Attacks
    OpportunityAttackService,
    // Spec 015 Eixo 7 — Reaction opportunities (Shield, Counterspell, ...)
    ReactionOpportunityService,
    // Spec 012 Lote C — Capstones
    CapstonesService,
    // Spec 002
    JoinRequestService,
    // Spec 016 — Play Shell Foundation
    FateLadderService,
    XpAwardService,
    RestEventPickerService,
    RestService,
    // Spec 016 M2 — Dice request lifecycle
    DiceRollService,
    StartEncounterFromNarrativeService,
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
