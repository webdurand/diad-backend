import { Injectable } from "@nestjs/common";
import {
  AiTurnExecutor,
  TurnExecutionPlan,
  AiTurnExecutorOpts,
} from "./ai-turn-executor.interface";
import {
  failure,
  GameErrorCode,
  GameResult,
  success,
} from "../interfaces/result.type";
import { AiProxyService } from "../../ai-proxy/ai-proxy.service";
import type { EncounterSnapshot } from "../interfaces/encounter-snapshot.interface";
import type { PlannedActionStep } from "../interfaces/combat.interfaces";
import { DiadLogger } from "../../../common/observability/logger/diad-logger.service";
import { UpstreamException } from "../../../common/observability/errors/diad-exception";
import { ErrorCode } from "../../../common/observability/errors/error-codes.catalog";


@Injectable()
export class RemoteAgentExecutor extends AiTurnExecutor {
  constructor(
    private readonly aiProxy: AiProxyService,
    private readonly logger: DiadLogger,
  ) {
    super();
    this.logger.setContext(RemoteAgentExecutor.name);
  }

  async executeTurn(
    snapshot: EncounterSnapshot,
    participantId: string,
    opts?: AiTurnExecutorOpts,
  ): Promise<GameResult<TurnExecutionPlan>> {
    const start = Date.now();
    try {
      const decision = await this.aiProxy.decideMonsterTurn({
        snapshot,
        participantId,
        continuationFrom: opts?.continuationFrom ?? null,
      });

      if (!Array.isArray(decision.steps)) {
        this.logger.warn("agent.monster_decide.invalid_response", {
          decision,
        });
        return failure(GameErrorCode.AI_UNAVAILABLE);
      }

      return success({
        steps: decision.steps as PlannedActionStep[],
        rationale: decision.rationale,
        llmCostUsd: decision.llmCostUsd,
        tookMs: Date.now() - start,
      });
    } catch (err: unknown) {
      this.logger.error("agent.monster_decide.failed", err, {
        participantId,
      });
      if (err instanceof UpstreamException) {
        if (err.code === ErrorCode.AGENT_TIMEOUT) {
          return failure(GameErrorCode.AI_TIMEOUT);
        }
        return failure(GameErrorCode.AI_UNAVAILABLE);
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (/timeout|timed out|aborted/i.test(msg)) {
        return failure(GameErrorCode.AI_TIMEOUT);
      }
      return failure(GameErrorCode.AI_UNAVAILABLE);
    }
  }
}
