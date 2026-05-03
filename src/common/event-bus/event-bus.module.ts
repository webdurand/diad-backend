import { Global, Module, OnModuleInit } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  AudienceRoutingEntity,
  CampaignAudienceOverrideEntity,
  EventListenerProcessedEntity,
  EventSubscriberEntity,
  SessionEventEntity,
} from "src/entities";
import { NpcEntity } from "src/entities/npc.entity";
import { PendingGuardDispatchEntity } from "src/entities/pending-guard-dispatch.entity";
import { EventBusService } from "./event-bus.service";
import { AudienceMapService } from "./audience-map.service";
import { EventEnvelopeFactory } from "./event-envelope.factory";
import { HUDListener } from "./listeners/hud.listener";
import { WitnessPropagationListener } from "./listeners/witness-propagation.listener";
import { ReputationListener } from "./listeners/reputation.listener";
import { GuardDispatchListener } from "./listeners/guard-dispatch.listener";
import { GuardArrivalListener } from "./listeners/guard-arrival.listener";

/**
 * Spec 017 — EventBus Foundation Module (Global).
 *
 * Expõe `EventBusService` (publish/subscribe), `AudienceMapService`
 * (resolve com cache TTL 60s), `EventEnvelopeFactory` (gera eventId/timestamp/
 * traceId via CLS).
 *
 * Listeners default registrados via `OnModuleInit` — HUDListener (M1 stub).
 * Listeners cross-domain reais (Narrator/CombatAgent/Director/CompanionAI)
 * ficam pras specs filhas 018-022 (cada uma registra o seu via
 * `EventBusService.registerListener` no seu módulo de domínio).
 *
 * Importado em `AppModule` — providers e factory disponíveis em todo backend.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SessionEventEntity,
      AudienceRoutingEntity,
      CampaignAudienceOverrideEntity,
      EventSubscriberEntity,
      EventListenerProcessedEntity,
      NpcEntity,
      PendingGuardDispatchEntity,
    ]),
  ],
  providers: [
    EventBusService,
    AudienceMapService,
    EventEnvelopeFactory,
    HUDListener,
    WitnessPropagationListener,
    ReputationListener,
    GuardDispatchListener,
    GuardArrivalListener,
  ],
  exports: [
    EventBusService,
    AudienceMapService,
    EventEnvelopeFactory,
    TypeOrmModule,
  ],
})
export class EventBusModule implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly hudListener: HUDListener,
    private readonly witnessPropagationListener: WitnessPropagationListener,
    private readonly reputationListener: ReputationListener,
    private readonly guardDispatchListener: GuardDispatchListener,
    private readonly guardArrivalListener: GuardArrivalListener,
  ) {}

  onModuleInit(): void {
    this.eventBus.registerListener(this.hudListener);
    this.eventBus.registerListener(this.witnessPropagationListener);
    this.eventBus.registerListener(this.reputationListener);
    this.eventBus.registerListener(this.guardDispatchListener);
    this.eventBus.registerListener(this.guardArrivalListener);
  }
}
