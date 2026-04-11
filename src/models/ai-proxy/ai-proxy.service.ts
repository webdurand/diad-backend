import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

export interface SseEvent {
  event?: string;
  data: string;
  id?: string;
}

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
   * Forwards a request to the Python agent service and returns the SSE stream.
   * The stream is piped chunk-by-chunk — never buffered.
   */
  async streamFromAgent(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Readable> {
    const url = `${this.agentBaseUrl}${path}`;
    this.logger.debug(`Streaming from agent: POST ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      this.logger.error(`Agent error ${response.status}: ${errorText}`);
      throw new Error(`Agent service responded with ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Agent service returned no body');
    }

    return Readable.fromWeb(response.body as any);
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
