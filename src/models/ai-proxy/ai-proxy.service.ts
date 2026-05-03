import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import * as http from "http";
import { OutboundFetch } from "../../common/observability/http/outbound-fetch.service";
import { DiadLogger } from "../../common/observability/logger/diad-logger.service";
import { ClsService } from "nestjs-cls";
import {
  TRACEPARENT_HEADER,
  generateSpanId,
  generateTraceparent,
  generateTraceId,
} from "../../common/observability/trace/trace-context";

@Injectable()
export class AiProxyService {
  private readonly agentBaseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly outbound: OutboundFetch,
    private readonly logger: DiadLogger,
    private readonly cls: ClsService,
  ) {
    this.logger.setContext(AiProxyService.name);
    this.agentBaseUrl =
      this.configService.get<string>("AGENT_BASE_URL") ??
      "http://localhost:9003";
  }

  getAgentBaseUrl(): string {
    return this.agentBaseUrl;
  }

  /**
   * Spec 026 Pillar 4 — service key compartilhada com diad-agents (header
   * `X-Service-Key`). Controllers usam pra montar headers do pipeStream
   * quando o agents endpoint exige auth service-to-service.
   */
  getServiceKey(): string {
    return (
      this.configService.get<string>("SERVICE_KEY") ?? "diad-internal-dev"
    );
  }

  /**
   * Pipes an SSE stream from the Python agent to the Express response.
   * Uses raw http.request for reliable streaming (no fetch/undici issues).
   *
   * Princípio XI: outbound traceparent é injetado no header do request.
   *
   * IMPORTANT: This is a *full passthrough* — every chunk received from the
   * agents service is forwarded to the client verbatim, with NO parsing,
   * filtering, or whitelisting by event type. New SSE event types added on
   * the agents side flow through automatically without backend changes.
   *
   * `onChunk`: callback opcional invocado com cada chunk recebido do upstream
   * ANTES do passthrough — usado pelos endpoints solo pra acumular a
   * narração via `SseNarrationCollector` e persistir server-side em
   * `session_messages`. Não-bloqueante; exceções são engolidas pra não
   * sabotar o stream.
   *
   * `onEnd`: callback opcional invocado APÓS o upstream finalizar e ANTES
   * do `res.end()`. Aceita Promise — o response só fecha após o awaited
   * resolver. Garante que persistência server-side termine antes do client
   * receber EOF (sem isso, GET /sessions/:id/messages logo após o stream
   * pode não ver a narração mais nova).
   */
  pipeStream(
    path: string,
    body: Record<string, unknown>,
    res: Response,
    onChunk?: (chunk: Buffer) => void,
    onEnd?: () => Promise<void> | void,
    extraHeaders?: Record<string, string>,
  ): Promise<void> {
    return new Promise((resolve) => {
      const url = new URL(`${this.agentBaseUrl}${path}`);
      const payload = JSON.stringify(body);
      const traceparent = this.buildOutboundTraceparent();

      this.logger.debug("http.client.stream.start", {
        "http.request.method": "POST",
        "url.path": url.toString(),
        "upstream.service": "diad-agents",
      });

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            [TRACEPARENT_HEADER]: traceparent,
            ...(extraHeaders ?? {}),
          },
        },
        (proxyRes) => {
          if (proxyRes.statusCode !== 200) {
            let errorBody = "";
            proxyRes.on("data", (c) => (errorBody += c));
            proxyRes.on("end", () => {
              this.logger.warn("http.client.stream.upstream_error", {
                "http.response.status_code": proxyRes.statusCode,
                "upstream.service": "diad-agents",
                "upstream.body": errorBody,
              });
              res.write(
                `data: ${JSON.stringify({ type: "error", content: errorBody })}\n\n`,
              );
              res.end();
              resolve();
            });
            return;
          }

          // Pipe chunks directly — no buffering
          proxyRes.on("data", (chunk: Buffer) => {
            if (onChunk) {
              try {
                onChunk(chunk);
              } catch {
                // Side-channel collectors nunca podem derrubar o passthrough.
              }
            }
            res.write(chunk);
            if (typeof (res as any).flush === "function") {
              (res as any).flush();
            }
          });

          proxyRes.on("end", () => {
            this.logger.debug("http.client.stream.end", {
              "upstream.service": "diad-agents",
            });
            const finish = async () => {
              if (onEnd) {
                try {
                  await onEnd();
                } catch (err: any) {
                  this.logger.warn("http.client.stream.on_end_failed", {
                    "upstream.service": "diad-agents",
                    "error.message": err?.message,
                  });
                }
              }
              res.end();
              resolve();
            };
            void finish();
          });

          proxyRes.on("error", (err) => {
            this.logger.error("http.client.stream.proxy_error", err, {
              "upstream.service": "diad-agents",
            });
            res.end();
            resolve();
          });
        },
      );

      req.on("error", (err) => {
        this.logger.error("http.client.stream.network_error", err, {
          "upstream.service": "diad-agents",
        });
        res.write(
          `data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`,
        );
        res.end();
        resolve();
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Makes a regular (non-streaming) request to the agent service.
   *
   * Princípio XI: usa OutboundFetch que injeta traceparent, captura erros
   * upstream com code+detail+context.upstream preservados via UpstreamException.
   * Não emite mais `throw new Error(...)` — esse era o caso motivador da spec 016.
   */
  async requestAgent<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.agentBaseUrl}${path}`;
    return this.outbound.request<T>(url, {
      method,
      upstreamService: "diad-agents",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  /**
   * Spec 003 T046 — chama `POST /monsters/decide` em `diad-agents` para que o
   * motor de IA (rule-based/medium/LLM conforme INT+WIS do monstro) retorne o
   * plano do turno. O `RemoteAgentExecutor` envolve este método.
   */
  async decideMonsterTurn(payload: {
    snapshot: unknown;
    participantId: string;
    continuationFrom?: number | null;
  }): Promise<MonsterDecideResponse> {
    const serviceKey =
      this.configService.get<string>("SERVICE_KEY") ?? "diad-internal-dev";

    const timeoutMs = Number(
      this.configService.get<string>("AI_TURN_TIMEOUT_MS") ?? "30000",
    );

    return this.outbound.request<MonsterDecideResponse>(
      `${this.agentBaseUrl}/monsters/decide`,
      {
        method: "POST",
        upstreamService: "diad-agents",
        timeoutMs,
        headers: {
          "Content-Type": "application/json",
          "X-Service-Key": serviceKey,
        },
        body: JSON.stringify(payload),
      },
    );
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
}

export interface MonsterDecideResponse {
  steps: unknown[];
  rationale?: string;
  llmCostUsd?: number;
  tookMs?: number;
  decisionMode?: "rule-based" | "medium-heuristic" | "llm";
}
