import { Injectable, Optional } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { PinoLogger, InjectPinoLogger } from "nestjs-pino";

/**
 * Wrapper sobre PinoLogger que injeta trace.id/span.id do CLS em toda log line.
 *
 * Uso:
 *   constructor(private readonly logger: DiadLogger) {
 *     this.logger.setContext('AiProxyService');
 *   }
 *   this.logger.info('http.client.request', { 'http.request.method': 'POST', ... });
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
    return {
      event,
      ...traceCtx,
      ...(attrs ?? {}),
    };
  }

  private readTraceContext(): Record<string, string> {
    if (!this.cls) return {};
    try {
      if (!this.cls.isActive()) return {};
    } catch {
      return {};
    }
    const out: Record<string, string> = {};
    const traceId = this.cls.get<string>("traceId");
    const spanId = this.cls.get<string>("spanId");
    const parentSpanId = this.cls.get<string>("parentSpanId");
    if (traceId) out["trace.id"] = traceId;
    if (spanId) out["span.id"] = spanId;
    if (parentSpanId) out["parent.span.id"] = parentSpanId;
    return out;
  }
}
