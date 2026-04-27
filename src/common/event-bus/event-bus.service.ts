import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SessionEventEntity } from "src/entities/session-event.entity";
import { DomainException } from "../observability/errors/diad-exception";
import { ErrorCode } from "../observability/errors/error-codes.catalog";
import { DiadLogger } from "../observability/logger/diad-logger.service";
import { AudienceMapService } from "./audience-map.service";
import { EventListener, isEventTypeRegistered } from "./event-bus.types";
import {
  EventAudience,
  EventCategory,
  EventEnvelope,
} from "./event-envelope.types";

/**
 * Spec 017 — Pub/sub in-process síncrono pra eventos cross-domain.
 *
 * Princípio X v1.4.0 NON-NEGOTIABLE — toda feature mecânica/ambient/social/persona
 * publica `EventEnvelope` aqui; bus despacha pra listeners por categoria com
 * audiences resolvidas via `AudienceMapService`.
 *
 * Garantias:
 *  - **Catalog gate** — `eventType` fora do catálogo (event-categories.json)
 *    é rejeitado com `EVENT_TYPE_NOT_REGISTERED` 422 (Princípio XI envelope).
 *  - **Persistência best-effort** — row em `session_events` enfileirada em
 *    background (não bloqueia despacho dos listeners).
 *  - **Listener crash NÃO rollback** — try/catch envolve cada `handle`; falha
 *    vira log estruturado `event_bus.listener_failed` (Princípio XI).
 *  - **Audiences computadas** — se publish chama sem `audiences`, resolve via
 *    `AudienceMapService` com cache TTL 60s.
 *
 * Não é Event Sourcing puro. Listeners são at-least-once em side-effects
 * — devem ser idempotentes (`event_listener_processed` table, ADR-017).
 */
@Injectable()
export class EventBusService {
  private readonly listeners = new Map<EventCategory, Set<EventListener>>();

  constructor(
    @InjectRepository(SessionEventEntity)
    private readonly eventRepo: Repository<SessionEventEntity>,
    private readonly audienceMap: AudienceMapService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(EventBusService.name);
  }

  /**
   * Registra um listener pra uma categoria. Retorna função `unsubscribe()`
   * que remove. Listener pode assinar múltiplas categorias chamando subscribe
   * várias vezes (ou usando `categories[]` da interface).
   */
  subscribe(category: EventCategory, listener: EventListener): () => void {
    let bucket = this.listeners.get(category);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(category, bucket);
    }
    bucket.add(listener);
    return () => {
      const set = this.listeners.get(category);
      if (set) set.delete(listener);
    };
  }

  /**
   * Atalho — registra listener pra todas as categorias declaradas em
   * `listener.categories`. Retorna unsubscribe que remove de todas.
   */
  registerListener(listener: EventListener): () => void {
    const unsubscribers = listener.categories.map((cat) =>
      this.subscribe(cat, listener),
    );
    return () => {
      for (const u of unsubscribers) u();
    };
  }

  /**
   * Publica um EventEnvelope. Validação + persistência (background) +
   * dispatch sync para listeners da categoria.
   *
   * Errors:
   *  - `EVENT_TYPE_NOT_REGISTERED` 422 — eventType não está no catálogo.
   */
  async publish(envelope: EventEnvelope): Promise<EventEnvelope> {
    if (!isEventTypeRegistered(envelope.eventCategory, envelope.eventType)) {
      throw new DomainException(
        ErrorCode.EVENT_TYPE_NOT_REGISTERED,
        `eventType '${envelope.eventType}' não está registrado em '${envelope.eventCategory}'.`,
        {
          context: {
            eventCategory: envelope.eventCategory,
            eventType: envelope.eventType,
          },
          hint: "Adicione o eventType ao contracts/event-categories.json e ao catálogo TS antes de publicar.",
        },
      );
    }

    const audiences = await this.resolveAudiences(envelope);
    const enriched: EventEnvelope = { ...envelope, audiences };

    void this.persistInBackground(enriched);

    await this.dispatch(enriched);

    return enriched;
  }

  private async resolveAudiences(
    envelope: EventEnvelope,
  ): Promise<EventAudience[]> {
    if (envelope.audiences && envelope.audiences.length > 0) {
      return envelope.audiences;
    }
    return this.audienceMap.resolve(envelope);
  }

  private async dispatch(envelope: EventEnvelope): Promise<void> {
    const bucket = this.listeners.get(envelope.eventCategory);
    if (!bucket || bucket.size === 0) return;
    for (const listener of bucket) {
      try {
        await listener.handle(envelope);
      } catch (err) {
        // Princípio XI — log estruturado com cause preservado.
        this.logger.error("event_bus.listener_failed", err, {
          "event.category": envelope.eventCategory,
          "event.type": envelope.eventType,
          "event.id": envelope.eventId,
          "trace.id": envelope.source.traceId,
          "listener.name": listener.name,
        });
      }
    }
  }

  private async persistInBackground(envelope: EventEnvelope): Promise<void> {
    try {
      const sessionId = envelope.scope.sessionId;
      if (!sessionId) {
        // Eventos sem sessionId (ex: campaign-level) ainda não persistem aqui;
        // session_events.session_id é NOT NULL. Compat mantém legado funcionando.
        return;
      }
      const sequence = await this.getNextSequence(sessionId);
      await this.eventRepo.save(
        this.eventRepo.create({
          sessionId,
          sceneId: envelope.scope.sceneId,
          eventType: envelope.eventType,
          summary: envelope.narrativeDescriptor ?? envelope.eventType,
          details: {},
          isVisibleToPlayers: true,
          sequence,
          eventCategory: envelope.eventCategory,
          eventPayload: envelope.payload,
          audiences: envelope.audiences,
          traceId: envelope.source.traceId,
          spanId: envelope.source.spanId ?? null,
          narrativeDescriptor: envelope.narrativeDescriptor ?? null,
          metadata: (envelope.metadata as Record<string, unknown>) ?? {},
          version: envelope.version,
          aggregateId: envelope.aggregateId,
        }),
      );
    } catch (err) {
      this.logger.error("event_bus.persist_failed", err, {
        "event.id": envelope.eventId,
        "event.category": envelope.eventCategory,
        "event.type": envelope.eventType,
        "trace.id": envelope.source.traceId,
      });
    }
  }

  private async getNextSequence(sessionId: string): Promise<number> {
    const result = await this.eventRepo
      .createQueryBuilder("e")
      .select("COALESCE(MAX(e.sequence), 0)", "max")
      .where("e.session_id = :sessionId", { sessionId })
      .getRawOne<{ max: string | number }>();
    const raw = result?.max ?? 0;
    const parsed = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    return (Number.isFinite(parsed) ? parsed : 0) + 1;
  }
}
