import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import { DiadLogger } from "../../observability/logger/diad-logger.service";
import { EventListener } from "../event-bus.types";
import {
  EVENT_CATEGORIES,
  EventCategory,
  EventEnvelope,
} from "../event-envelope.types";

/**
 * Observabilidade-only: assina todos eventos pra trail estruturado em log e
 * tabela de idempotência. Agregação real vive em mv_admin_features_daily,
 * refreshado por cron 5min — listener não escreve métrica row-a-row pra evitar
 * write amplification em Postgres puro. Quando volume justificar realtime,
 * trocar pra incremental update via pg_ivm (gate documentado no ADR-0008).
 */
@Injectable()
export class AdminMetricsListener implements EventListener {
  readonly name = "AdminMetricsListener";
  readonly categories: readonly EventCategory[] = EVENT_CATEGORIES;

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(AdminMetricsListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (await this.alreadyProcessed(envelope.eventId)) return;

    this.logger.info("event_bus.admin_metrics.observed", {
      "event.id": envelope.eventId,
      "event.category": envelope.eventCategory,
      "event.type": envelope.eventType,
      "scope.campaign_id": envelope.scope.campaignId,
      "scope.session_id": envelope.scope.sessionId,
      "trace.id": envelope.source.traceId,
    });

    await this.markProcessed(envelope.eventId);
  }

  private async alreadyProcessed(eventId: string): Promise<boolean> {
    const found = await this.processedRepo.findOne({
      where: { listenerName: this.name, eventId },
      select: ["id"],
    });
    return !!found;
  }

  private async markProcessed(eventId: string): Promise<void> {
    try {
      await this.processedRepo.save(
        this.processedRepo.create({ listenerName: this.name, eventId }),
      );
    } catch (err) {
      this.logger.warn("event_bus.admin_metrics.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
