import { Injectable } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { ErrorCode } from "../errors/error-codes.catalog";
import { UpstreamException } from "../errors/diad-exception";
import { DiadLogger } from "../logger/diad-logger.service";
import {
  TRACEPARENT_HEADER,
  generateSpanId,
  generateTraceparent,
  generateTraceId,
} from "../trace/trace-context";
import {
  DOMAIN_HEADER,
  serializeDomainHeader,
  type DomainContext,
} from "../domain/domain-context";
import { DOMAIN_CLS_KEY } from "../domain/domain-context.middleware";

export interface OutboundRequestInit extends RequestInit {
  upstreamService: "diad-agents" | "diad-backend" | "diad-frontend" | string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * fetch() wrapper que:
 *  - Propaga traceparent (mesmo trace-id, novo span-id) via CLS.
 *  - Aplica timeout via AbortController (default 30s) → AGENT_TIMEOUT.
 *  - Detecta network failure → AGENT_UNREACHABLE.
 *  - Parseia application/problem+json upstream → UpstreamException com code preservado.
 *  - Detecta heurística "200 com erro" (body.error truthy && !body.data) → AGENT_INVALID_RESPONSE.
 *  - Loga wide-event http.client.request.
 */
@Injectable()
export class OutboundFetch {
  constructor(
    private readonly cls: ClsService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(OutboundFetch.name);
  }

  async request<T = unknown>(
    input: RequestInfo | URL,
    init: OutboundRequestInit,
  ): Promise<T> {
    const start = Date.now();
    const url = this.resolveUrl(input);
    const method = (init.method ?? "GET").toUpperCase();
    const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const headers = this.buildHeaders(init.headers);

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(input, {
        ...init,
        headers,
        signal: this.combineSignals(controller.signal, init.signal ?? null),
      });
    } catch (err) {
      clearTimeout(timeoutHandle);
      this.logRequest({
        method,
        url,
        status: 0,
        durationMs: Date.now() - start,
        upstream: init.upstreamService,
        outcome: "network_error",
      });
      throw this.wrapNetworkError(err, init.upstreamService);
    }
    clearTimeout(timeoutHandle);

    const contentType = response.headers.get("content-type") ?? "";
    const status = response.status;

    if (!response.ok) {
      const body = await this.safeReadBody(response, contentType);
      const upstreamCode = this.extractUpstreamCode(body);
      const detail = this.extractUpstreamDetail(body, status);
      this.logRequest({
        method,
        url,
        status,
        durationMs: Date.now() - start,
        upstream: init.upstreamService,
        outcome: "upstream_error",
      });
      throw new UpstreamException(
        upstreamCode ?? ErrorCode.AGENT_UPSTREAM_ERROR,
        detail,
        {
          upstream: {
            service: init.upstreamService,
            status,
            ...(upstreamCode ? { code: upstreamCode } : {}),
            body,
            traceId: this.extractUpstreamTraceId(body),
          },
        },
      );
    }

    const body = await this.safeReadBody(response, contentType);
    if (this.is200WithError(body)) {
      this.logRequest({
        method,
        url,
        status,
        durationMs: Date.now() - start,
        upstream: init.upstreamService,
        outcome: "invalid_response",
      });
      throw new UpstreamException(
        ErrorCode.AGENT_INVALID_RESPONSE,
        this.extractUpstreamDetail(body, status),
        {
          upstream: {
            service: init.upstreamService,
            status,
            body,
          },
        },
      );
    }

    this.logRequest({
      method,
      url,
      status,
      durationMs: Date.now() - start,
      upstream: init.upstreamService,
      outcome: "ok",
    });

    return body as T;
  }

  private buildHeaders(initHeaders?: HeadersInit): Record<string, string> {
    const out: Record<string, string> = {};
    if (initHeaders) {
      if (initHeaders instanceof Headers) {
        initHeaders.forEach((v, k) => {
          out[k] = v;
        });
      } else if (Array.isArray(initHeaders)) {
        for (const [k, v] of initHeaders) out[k] = v;
      } else {
        Object.assign(out, initHeaders);
      }
    }
    if (!out["content-type"] && !out["Content-Type"]) {
      out["Content-Type"] = "application/json";
    }
    out[TRACEPARENT_HEADER] = this.buildOutboundTraceparent();
    const domainHeader = this.buildOutboundDomainHeader();
    if (domainHeader) out[DOMAIN_HEADER] = domainHeader;
    return out;
  }

  private buildOutboundDomainHeader(): string {
    try {
      if (!this.cls.isActive()) return "";
      const ctx = this.cls.get<DomainContext>(DOMAIN_CLS_KEY);
      if (!ctx || typeof ctx !== "object") return "";
      return serializeDomainHeader(ctx);
    } catch {
      return "";
    }
  }

  private buildOutboundTraceparent(): string {
    const traceId = this.readClsString("traceId") ?? generateTraceId();
    return generateTraceparent(traceId, generateSpanId());
  }

  private readClsString(key: string): string | undefined {
    try {
      if (!this.cls.isActive()) return undefined;
      const v = this.cls.get<string>(key);
      return typeof v === "string" && v.length ? v : undefined;
    } catch {
      return undefined;
    }
  }

  private resolveUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    return input.url;
  }

  private combineSignals(
    primary: AbortSignal,
    secondary: AbortSignal | null,
  ): AbortSignal {
    if (!secondary) return primary;
    if (typeof AbortSignal.any === "function") {
      return AbortSignal.any([primary, secondary]);
    }
    return primary;
  }

  private async safeReadBody(
    response: Response,
    contentType: string,
  ): Promise<unknown> {
    try {
      if (
        contentType.includes("application/json") ||
        contentType.includes("problem+json")
      ) {
        return await response.json();
      }
      const text = await response.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch {
      return null;
    }
  }

  private extractUpstreamCode(body: unknown): ErrorCode | undefined {
    if (!body || typeof body !== "object") return undefined;
    const code = (body as Record<string, unknown>).code;
    if (typeof code !== "string") return undefined;
    // Apenas se já bater no nosso enum — caso contrário deixa undefined e
    // engolimos só o detail; mantemos AGENT_UPSTREAM_ERROR.
    return undefined;
  }

  private extractUpstreamDetail(body: unknown, status: number): string {
    if (typeof body === "string" && body.length) return body;
    if (body && typeof body === "object") {
      const obj = body as Record<string, unknown>;
      if (typeof obj.detail === "string") return obj.detail;
      if (typeof obj.error === "string") return obj.error;
      if (typeof obj.message === "string") return obj.message;
    }
    return `Upstream HTTP ${status}`;
  }

  private extractUpstreamTraceId(body: unknown): string | undefined {
    if (!body || typeof body !== "object") return undefined;
    const v = (body as Record<string, unknown>).traceId;
    return typeof v === "string" ? v : undefined;
  }

  private is200WithError(body: unknown): boolean {
    if (!body || typeof body !== "object") return false;
    const obj = body as Record<string, unknown>;
    if (!("error" in obj)) return false;
    if (!obj.error) return false;
    if ("data" in obj) return false;
    return true;
  }

  private wrapNetworkError(err: unknown, service: string): UpstreamException {
    const message = err instanceof Error ? err.message : String(err);
    const isAbort =
      (err instanceof Error && err.name === "AbortError") ||
      /aborted|timeout/i.test(message);
    const code = isAbort
      ? ErrorCode.AGENT_TIMEOUT
      : ErrorCode.AGENT_UNREACHABLE;
    return new UpstreamException(code, message || "Upstream call failed", {
      upstream: {
        service,
        status: 0,
      },
      cause: err,
    });
  }

  private logRequest(args: {
    method: string;
    url: string;
    status: number;
    durationMs: number;
    upstream: string;
    outcome: "ok" | "network_error" | "upstream_error" | "invalid_response";
  }): void {
    const event = "http.client.request";
    const attrs = {
      "http.request.method": args.method,
      "http.response.status_code": args.status,
      "url.path": args.url,
      "upstream.service": args.upstream,
      duration_ms: args.durationMs,
      outcome: args.outcome,
    };
    if (args.outcome === "ok") this.logger.info(event, attrs);
    else this.logger.warn(event, attrs);
  }
}
