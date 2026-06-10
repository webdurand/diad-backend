import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OutboundFetch } from "src/common/observability/http/outbound-fetch.service";
import type {
  ClosingSeedPlannerPort,
  ClosingSeedPlanningInput,
} from "../application/commit-closing-seed.use-case";
import type { ClosingSeedSnapshot } from "../domain/hidden-layer.types";

const CLOSING_SEED_PLANNER_TIMEOUT_MS = 1_500;

@Injectable()
export class AgentClosingSeedPlannerService implements ClosingSeedPlannerPort {
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

  async plan(input: ClosingSeedPlanningInput): Promise<ClosingSeedSnapshot> {
    return this.outbound.request<ClosingSeedSnapshot>(
      `${this.agentBaseUrl}/internal/bookends/closing-seed`,
      {
        method: "POST",
        upstreamService: "diad-agents",
        timeoutMs: CLOSING_SEED_PLANNER_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": this.internalToken,
        },
        body: JSON.stringify(input),
      },
    );
  }
}
