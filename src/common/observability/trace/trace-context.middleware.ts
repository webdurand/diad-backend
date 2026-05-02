import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { ClsService } from "nestjs-cls";
import {
  TRACEPARENT_HEADER,
  generateSpanId,
  generateTraceparent,
  parseTraceparent,
} from "./trace-context";

/**
 * Lê traceparent do request, parseia, gera novo se ausente/inválido.
 * Popula CLS com traceId/spanId/parentSpanId. Ecoa header no response.
 *
 * Sempre tenta ser graceful — middleware NUNCA rejeita request por trace inválido.
 *
 * Não emite log próprio: pinoHttp auto-loga 1x por request no fim com customLogLevel
 * controlando ruído (ver pino.config.ts), e RequestBodyLogInterceptor / GlobalExceptionFilter
 * cobrem body/erro. Logar aqui dobraria linhas sem ganho.
 */
@Injectable()
export class TraceContextMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    try {
      this.applyTrace(req, res);
    } catch {
      // Observability nunca quebra request. Falha silenciosa pra logger fallback.
    }
    next();
  }

  private applyTrace(req: Request, res: Response): void {
    const incoming = req.headers[TRACEPARENT_HEADER];
    const incomingHeader = Array.isArray(incoming) ? incoming[0] : incoming;
    const parsed = parseTraceparent(incomingHeader);

    let traceId: string;
    let parentSpanId: string | undefined;
    let origin: "inherited" | "generated";
    if (parsed) {
      traceId = parsed.traceId;
      parentSpanId = parsed.parentSpanId;
      origin = "inherited";
    } else {
      const tp = generateTraceparent();
      const reparsed = parseTraceparent(tp)!;
      traceId = reparsed.traceId;
      parentSpanId = undefined;
      origin = "generated";
    }

    const spanId = generateSpanId();
    const responseTraceparent = generateTraceparent(traceId, spanId);

    this.cls.set("traceId", traceId);
    this.cls.set("spanId", spanId);
    if (parentSpanId) this.cls.set("parentSpanId", parentSpanId);
    this.cls.set("trace.origin", origin);

    res.setHeader(TRACEPARENT_HEADER, responseTraceparent);
  }
}
