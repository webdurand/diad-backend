import { Injectable, Logger } from '@nestjs/common';
import {
  AiTurnExecutor,
  TurnExecutionPlan,
  AiTurnExecutorOpts,
} from './ai-turn-executor.interface';
import {
  failure,
  GameErrorCode,
  GameResult,
  success,
} from '../interfaces/result.type';
import { AiProxyService } from '../../ai-proxy/ai-proxy.service';
import type { EncounterSnapshot } from '../interfaces/encounter-snapshot.interface';
import type { PlannedActionStep } from '../interfaces/combat.interfaces';

/**
 * Spec 003 T047 — implementação default do `AiTurnExecutor`. Delega a decisão
 * ao serviço Python `diad-agents` via `AiProxyService.decideMonsterTurn`.
 *
 * Classificação de erros:
 *  - Timeout → `AI_TIMEOUT` (caller pode fallback pra `end-turn` implícito).
 *  - Connection refused / 5xx → `AI_UNAVAILABLE`.
 *  - Resposta inválida → `AI_UNAVAILABLE` (tratamos como upstream broken).
 */
@Injectable()
export class RemoteAgentExecutor extends AiTurnExecutor {
  private readonly logger = new Logger(RemoteAgentExecutor.name);

  constructor(private readonly aiProxy: AiProxyService) {
    super();
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
        this.logger.warn(
          `diad-agents retornou resposta inválida: ${JSON.stringify(decision)}`,
        );
        return failure(GameErrorCode.AI_UNAVAILABLE);
      }

      return success({
        steps: decision.steps as PlannedActionStep[],
        rationale: decision.rationale,
        llmCostUsd: decision.llmCostUsd,
        tookMs: Date.now() - start,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Erro ao chamar diad-agents /monsters/decide: ${msg}`);
      if (/timeout|timed out/i.test(msg)) {
        return failure(GameErrorCode.AI_TIMEOUT);
      }
      return failure(GameErrorCode.AI_UNAVAILABLE);
    }
  }
}
