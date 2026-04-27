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

/**
 * Spec 003 T047 — implementação default do `AiTurnExecutor`. Delega a decisão
 * ao serviço Python `diad-agents` via `AiProxyService.decideMonsterTurn`.
 *
 * Spec 016 — usa OutboundFetch via AiProxyService. Erros upstream chegam como
 * UpstreamException com code semântico (AGENT_TIMEOUT, AGENT_UNREACHABLE,
 * AGENT_UPSTREAM_ERROR), permitindo classificação precisa.
 *
 * Classificação de erros:
 *  - AGENT_TIMEOUT → `AI_TIMEOUT` (caller pode fallback pra `end-turn` implícito).
 *  - AGENT_UNREACHABLE / AGENT_UPSTREAM_ERROR / outros → `AI_UNAVAILABLE`.
 *  - Resposta inválida → `AI_UNAVAILABLE`.
 */
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
