import { Injectable, Optional } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { randomUUID } from "crypto";
import { generateTraceId } from "../observability/trace/trace-context";
import {
  EventEnvelope,
  EventEnvelopeInput,
  TRACE_ID_REGEX,
} from "./event-envelope.types";

/**
 * Spec 017 — Factory que monta `EventEnvelope` completo a partir de input
 * parcial dos publishers.
 *
 * Responsabilidades:
 *  - Gera `eventId` UUID v4 quando ausente.
 *  - Gera `timestamp` ISO-8601 UTC quando ausente.
 *  - Lê `traceId` do CLS quando disponível; regera (W3C 32 hex) caso contrário.
 *    Princípio XI — todo envelope cross-boundary carrega traceId.
 *  - Default `version = 1` (ADR-017 future-proofing).
 *
 * NÃO valida shape do payload — quem chama declara seu contract por eventType.
 * NÃO computa audiences — `EventBusService` resolve via `AudienceMapService`.
 */
@Injectable()
export class EventEnvelopeFactory {
  constructor(@Optional() private readonly cls?: ClsService) {}

  build(input: EventEnvelopeInput): EventEnvelope {
    const traceId = this.resolveTraceId(input.source.traceId);
    return {
      eventId: input.eventId ?? randomUUID(),
      version: input.version ?? 1,
      aggregateId: input.aggregateId ?? this.inferAggregateId(input.scope),
      timestamp: input.timestamp ?? new Date().toISOString(),
      eventCategory: input.eventCategory,
      eventType: input.eventType,
      source: {
        service: input.source.service,
        module: input.source.module,
        traceId,
        ...(input.source.spanId ? { spanId: input.source.spanId } : {}),
      },
      scope: input.scope,
      payload: input.payload,
      audiences: input.audiences ?? [],
      ...(input.narrativeDescriptor
        ? { narrativeDescriptor: input.narrativeDescriptor }
        : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
  }

  /**
   * ADR-017 — `aggregateId` é a chave que ES futuro usa pra reconstruir
   * state por aggregate. Quando publisher não declara, inferimos a partir
   * do escopo mais específico disponível (encounter > session > scene > campaign).
   * Garante que todo envelope tenha aggregateId — Princípio X obrigatório.
   */
  private inferAggregateId(scope: EventEnvelopeInput["scope"]): string {
    return (
      scope.encounterId ?? scope.sessionId ?? scope.sceneId ?? scope.campaignId
    );
  }

  private resolveTraceId(provided: string | undefined): string {
    if (provided && TRACE_ID_REGEX.test(provided)) return provided;
    const fromCls = this.readClsTraceId();
    if (fromCls && TRACE_ID_REGEX.test(fromCls)) return fromCls;
    return generateTraceId();
  }

  private readClsTraceId(): string | undefined {
    if (!this.cls) return undefined;
    try {
      if (!this.cls.isActive()) return undefined;
      const v = this.cls.get<string>("traceId");
      return typeof v === "string" && v.length ? v : undefined;
    } catch {
      return undefined;
    }
  }
}
