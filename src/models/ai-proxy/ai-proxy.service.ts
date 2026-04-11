import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import * as http from 'http';

@Injectable()
export class AiProxyService {
  private readonly logger = new Logger(AiProxyService.name);
  private readonly agentBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.agentBaseUrl =
      this.configService.get<string>('AGENT_BASE_URL') ?? 'http://localhost:7777';
  }

  getAgentBaseUrl(): string {
    return this.agentBaseUrl;
  }

  /**
   * Pipes an SSE stream from the Python agent to the Express response.
   * Uses raw http.request for reliable streaming (no fetch/undici issues).
   */
  pipeStream(
    path: string,
    body: Record<string, unknown>,
    res: Response,
  ): Promise<void> {
    return new Promise((resolve) => {
      const url = new URL(`${this.agentBaseUrl}${path}`);
      const payload = JSON.stringify(body);

      this.logger.debug(`Piping stream: POST ${url}`);

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (proxyRes) => {
          if (proxyRes.statusCode !== 200) {
            let errorBody = '';
            proxyRes.on('data', (c) => (errorBody += c));
            proxyRes.on('end', () => {
              this.logger.error(`Agent ${proxyRes.statusCode}: ${errorBody}`);
              res.write(`data: ${JSON.stringify({ type: 'error', content: errorBody })}\n\n`);
              res.end();
              resolve();
            });
            return;
          }

          // Pipe chunks directly — no buffering
          proxyRes.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            this.logger.debug(`SSE chunk: ${text.trim().substring(0, 80)}`);
            res.write(chunk);
            if (typeof (res as any).flush === 'function') {
              (res as any).flush();
            }
          });

          proxyRes.on('end', () => {
            this.logger.debug('SSE stream ended');
            res.end();
            resolve();
          });

          proxyRes.on('error', (err) => {
            this.logger.error(`Proxy response error: ${err.message}`);
            res.end();
            resolve();
          });
        },
      );

      req.on('error', (err) => {
        this.logger.error(`Proxy request error: ${err.message}`);
        res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
        res.end();
        resolve();
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Makes a regular (non-streaming) request to the agent service.
   */
  async requestAgent<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.agentBaseUrl}${path}`;
    this.logger.debug(`Request to agent: ${method} ${url}`);

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      this.logger.error(`Agent error ${response.status}: ${errorText}`);
      throw new Error(`Agent service responded with ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}
