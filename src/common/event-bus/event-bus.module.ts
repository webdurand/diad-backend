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
import { SessionNpcStateEntity } from "src/entities/session-npc-state.entity";
import { PendingGuardDispatchEntity } from "src/entities/pending-guard-dispatch.entity";
import { EventBusService } from "./event-bus.service";
import { AudienceMapService } from "./audience-map.service";
import { EventEnvelopeFactory } from "./event-envelope.factory";
import { HUDListener } from "./listeners/hud.listener";
import { WitnessPropagationListener } from "./listeners/witness-propagation.listener";
import { ReputationListener } from "./listeners/reputation.listener";
import { GuardDispatchListener } from "./listeners/guard-dispatch.listener";
import { GuardArrivalListener } from "./listeners/guard-arrival.listener";
import { AdminMetricsListener } from "./listeners/admin-metrics.listener";


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
      SessionNpcStateEntity,
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
    AdminMetricsListener,
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
    private readonly adminMetricsListener: AdminMetricsListener,
  ) {}

  onModuleInit(): void {
    this.eventBus.registerListener(this.hudListener);
    this.eventBus.registerListener(this.witnessPropagationListener);
    this.eventBus.registerListener(this.reputationListener);
    this.eventBus.registerListener(this.guardDispatchListener);
    this.eventBus.registerListener(this.guardArrivalListener);
    this.eventBus.registerListener(this.adminMetricsListener);
  }
}
