import { Injectable, Optional } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { PinoLogger, InjectPinoLogger } from "nestjs-pino";
import { DOMAIN_CLS_KEY } from "../domain/domain-context.middleware";
import { DOMAIN_KEYS, type DomainContext } from "../domain/domain-context";

/**
 * Wrapper sobre PinoLogger que injeta trace.id/span.id E contexto de domínio
 * (session.id, pc.id, turn.id, ...) do CLS em toda log line.
 *
 * Uso:
 *   constructor(private readonly logger: DiadLogger) {
 *     this.logger.setContext('AiProxyService');
 *   }
 *   this.logger.info('http.client.request', { 'http.request.method': 'POST', ... });
 *
 * Quem popula o CLS:
 *   - TraceContextMiddleware → traceId, spanId, parentSpanId, trace.origin
 *   - DomainContextMiddleware → domain (DomainContext)
 */
@Injectable()
export class DiadLogger {
  constructor(
    @InjectPinoLogger(DiadLogger.name)
    private readonly pino: PinoLogger,
    @Optional() private readonly cls?: ClsService,
  ) {}

  setContext(context: string): void {
    this.pino.setContext(context);
  }

  info(event: string, attrs?: Record<string, unknown>): void {
    this.pino.info(this.buildPayload(event, attrs), event);
  }

  warn(event: string, attrs?: Record<string, unknown>): void {
    this.pino.warn(this.buildPayload(event, attrs), event);
  }

  error(event: string, err?: unknown, attrs?: Record<string, unknown>): void {
    const payload = this.buildPayload(event, attrs);
    if (err !== undefined) {
      payload.err = err;
    }
    this.pino.error(payload, event);
  }

  debug(event: string, attrs?: Record<string, unknown>): void {
    this.pino.debug(this.buildPayload(event, attrs), event);
  }

  private buildPayload(
    event: string,
    attrs?: Record<string, unknown>,
  ): Record<string, unknown> {
    const traceCtx = this.readTraceContext();
    const domainCtx = this.readDomainContext();
    return {
      event,
      ...traceCtx,
      ...domainCtx,
      ...(attrs ?? {}),
    };
  }

  private readTraceContext(): Record<string, string> {
    if (!this.clsActive()) return {};
    const out: Record<string, string> = {};
    const traceId = this.cls!.get<string>("traceId");
    const spanId = this.cls!.get<string>("spanId");
    const parentSpanId = this.cls!.get<string>("parentSpanId");
    if (traceId) out["trace.id"] = traceId;
    if (spanId) out["span.id"] = spanId;
    if (parentSpanId) out["parent.span.id"] = parentSpanId;
    return out;
  }

  private readDomainContext(): Record<string, string> {
    if (!this.clsActive()) return {};
    const ctx = this.cls!.get<DomainContext>(DOMAIN_CLS_KEY);
    if (!ctx || typeof ctx !== "object") return {};
    const out: Record<string, string> = {};
    for (const key of DOMAIN_KEYS) {
      const v = ctx[key];
      if (typeof v === "string" && v.length) out[key] = v;
    }
    return out;
  }

  private clsActive(): boolean {
    if (!this.cls) return false;
    try {
      return this.cls.isActive();
    } catch {
      return false;
    }
  }
}
