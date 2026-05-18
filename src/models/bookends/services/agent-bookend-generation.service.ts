import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OutboundFetch } from "src/common/observability/http/outbound-fetch.service";
import {
  BOOKEND_SAMPLING,
  type GeneratedBookendProse,
} from "../domain/bookend.types";
import type { BookendGenerationPort, BookendGenerationRequest } from "../application/render-bookend-ceremony.use-case";

const BOOKEND_WRITER_TIMEOUT_MS = 8_000;

@Injectable()
export class AgentBookendGenerationService implements BookendGenerationPort {
  private readonly agentBaseUrl: string;
  private readonly internalToken: string;

  constructor(
    private readonly outbound: OutboundFetch,
    private readonly config: ConfigService,
  ) {
    this.agentBaseUrl =
      this.config.get<string>("AGENT_BASE_URL") ?? "http://localhost:9003";
    this.internalToken =
      this.config.get<string>("INTERNAL_AGENTS_TOKEN") ?? "diad-internal-dev";
  }

  async render(
    request: BookendGenerationRequest,
  ): Promise<GeneratedBookendProse> {
    return this.outbound.request<GeneratedBookendProse>(
      `${this.agentBaseUrl}/internal/bookends/render`,
      {
        method: "POST",
        upstreamService: "diad-agents",
        timeoutMs: BOOKEND_WRITER_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": this.internalToken,
        },
        body: JSON.stringify({
          sessionId: request.sessionId,
          phaseTransitionId: request.phaseTransitionId ?? null,
          kind: request.kind,
          snapshot: request.snapshot,
          retryHint: request.retryHint ?? null,
          recapText: request.recapText ?? null,
          outcomeTier: request.outcomeTier ?? null,
          closingSeedFocus: request.closingSeedFocus ?? null,
          closingSeedCrossroad: request.closingSeedCrossroad ?? null,
          diegeticRitualResolved: request.diegeticRitualResolved ?? null,
          hiddenSecretSeed: request.hiddenSecretSeed ?? null,
          xpTriggerState: request.xpTriggerState ?? null,
          twoBeatRequired: request.twoBeatRequired === true,
          sampling: BOOKEND_SAMPLING[request.kind],
          cacheControl: { type: "ephemeral", ttl: "1h" },
        }),
      },
    );
  }
}
