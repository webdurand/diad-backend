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
 * Spec 017 — HUDListener (STUB M1).
 *
 * Mvp: filtra envelopes com `audiences.includes('HUD')`, registra log
 * estruturado e marca em `event_listener_processed` (idempotência ADR-017).
 *
 * NÃO faz SSE push ainda — wiring com `useAiStream` e gateway WebSocket
 * fica pra próximo /execute (M2). Esta versão prova que:
 *  1. Bus dispatcha envelope completo pro listener.
 *  2. Listener é idempotente (2x same eventId → side-effect 1×).
 *  3. Audiência filtra corretamente — eventos sem 'HUD' são ignorados.
 */
@Injectable()
export class HUDListener implements EventListener {
  readonly name = "HUDListener";
  readonly categories: readonly EventCategory[] = EVENT_CATEGORIES;

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(HUDListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (!envelope.audiences?.includes("HUD")) {
      return;
    }

    if (await this.alreadyProcessed(envelope.eventId)) {
      return;
    }

    // STUB — log estruturado + mark processed. SSE push fica pra M2.
    this.logger.info("event_bus.hud.received", {
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
      // Race possível em retry concorrente — unique constraint força 1 row.
      // Erro graceful: o log de listener_failed acima do bus já capturaria
      // outras causas. Se já existe, está tudo certo (idempotente).
      this.logger.warn("event_bus.hud.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
