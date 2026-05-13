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


  getServiceKey(): string {
    return this.configService.get<string>("SERVICE_KEY") ?? "diad-internal-dev";
  }


  async postJsonToAgent<T = unknown>(
    path: string,
    body: Record<string, unknown>,
    opts: { timeoutMs?: number; userId?: string } = {},
  ): Promise<T> {
    const url = `${this.agentBaseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Service-Key": this.getServiceKey(),
    };
    if (opts.userId) headers["X-User-Id"] = opts.userId;

    return this.outbound.request<T>(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      timeoutMs: opts.timeoutMs ?? 8000,
      upstreamService: "diad-agents",
    });
  }


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





      const startedAt = Date.now();
      let chunkCount = 0;
      let bytesWritten = 0;
      let firstChunkAt: number | null = null;
      let lastChunkAt: number | null = null;
      let clientClosed = false;
      let normalEndStarted = false;

      const onClientClose = () => {
        if (clientClosed) return;
        clientClosed = true;
        if (normalEndStarted) return;
        this.logger.warn("http.client.stream.client_closed_mid_stream", {
          "upstream.service": "diad-agents",
          "url.path": url.pathname,
          "stream.chunk_count": chunkCount,
          "stream.bytes_written": bytesWritten,
          "stream.first_chunk_ms":
            firstChunkAt !== null ? firstChunkAt - startedAt : null,
          "stream.last_chunk_ms":
            lastChunkAt !== null ? lastChunkAt - startedAt : null,
          "stream.duration_ms": Date.now() - startedAt,
        });
      };
      res.on("close", onClientClose);

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


          proxyRes.on("data", (chunk: Buffer) => {
            chunkCount += 1;
            bytesWritten += chunk.length;
            const now = Date.now();
            if (firstChunkAt === null) firstChunkAt = now;
            lastChunkAt = now;

            if (onChunk) {
              try {
                onChunk(chunk);
              } catch {

              }
            }



            if (!clientClosed) {
              try {
                res.write(chunk);
                if (typeof (res as any).flush === "function") {
                  (res as any).flush();
                }
              } catch (err: any) {
                this.logger.warn("http.client.stream.write_failed", {
                  "upstream.service": "diad-agents",
                  "url.path": url.pathname,
                  "stream.chunk_count": chunkCount,
                  "stream.bytes_written": bytesWritten,
                  "error.message": err?.message,
                });
                clientClosed = true;
              }
            }
          });

          proxyRes.on("end", () => {
            normalEndStarted = true;
            this.logger.info("http.client.stream.end", {
              "upstream.service": "diad-agents",
              "url.path": url.pathname,
              "stream.chunk_count": chunkCount,
              "stream.bytes_written": bytesWritten,
              "stream.first_chunk_ms":
                firstChunkAt !== null ? firstChunkAt - startedAt : null,
              "stream.duration_ms": Date.now() - startedAt,
              "stream.client_closed_before_end": clientClosed,
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
              if (typeof (res as any).off === "function") {
                (res as any).off("close", onClientClose);
              } else if (typeof (res as any).removeListener === "function") {
                (res as any).removeListener("close", onClientClose);
              }
              res.end();
              resolve();
            };
            void finish();
          });

          proxyRes.on("error", (err) => {
            this.logger.error("http.client.stream.proxy_error", err, {
              "upstream.service": "diad-agents",
              "url.path": url.pathname,
              "stream.chunk_count": chunkCount,
              "stream.bytes_written": bytesWritten,
              "stream.duration_ms": Date.now() - startedAt,
            });
            res.end();
            resolve();
          });
        },
      );

      req.on("error", (err) => {
        this.logger.error("http.client.stream.network_error", err, {
          "upstream.service": "diad-agents",
          "url.path": url.pathname,
          "stream.chunk_count": chunkCount,
          "stream.bytes_written": bytesWritten,
          "stream.duration_ms": Date.now() - startedAt,
        });
        if (!clientClosed) {
          res.write(
            `data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`,
          );
        }
        res.end();
        resolve();
      });

      req.write(payload);
      req.end();
    });
  }


  async requestAgent<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ): Promise<T> {
    const url = `${this.agentBaseUrl}${path}`;
    return this.outbound.request<T>(url, {
      method,
      upstreamService: "diad-agents",
      ...(options?.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }


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

  async decideLair(payload: {
    snapshot: unknown;
    monsterParticipantId: string;
  }): Promise<{
    actionIndex: number | null;
    rationale?: string;
    tookMs: number;
    decisionMode: string;
  }> {
    const serviceKey =
      this.configService.get<string>("SERVICE_KEY") ?? "diad-internal-dev";
    const timeoutMs = Number(
      this.configService.get<string>("AI_TURN_TIMEOUT_MS") ?? "30000",
    );
    return this.outbound.request(`${this.agentBaseUrl}/monsters/decide-lair`, {
      method: "POST",
      upstreamService: "diad-agents",
      timeoutMs,
      headers: {
        "Content-Type": "application/json",
        "X-Service-Key": serviceKey,
      },
      body: JSON.stringify(payload),
    });
  }

  async decideLegendary(payload: {
    snapshot: unknown;
    monsterParticipantId: string;
    triggerEvent: string;
  }): Promise<{
    spend: boolean;
    actionName?: string;
    targetIds?: string[];
    cost?: 1 | 2 | 3;
    rationale?: string;
    tookMs: number;
    decisionMode: string;
  }> {
    const serviceKey =
      this.configService.get<string>("SERVICE_KEY") ?? "diad-internal-dev";
    const timeoutMs = Number(
      this.configService.get<string>("AI_TURN_TIMEOUT_MS") ?? "30000",
    );
    return this.outbound.request(
      `${this.agentBaseUrl}/monsters/decide-legendary`,
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
