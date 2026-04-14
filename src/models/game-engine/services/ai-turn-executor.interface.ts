import type { GameResult } from '../interfaces/result.type';
import type { PlannedActionStep } from '../interfaces/combat.interfaces';
import type { EncounterSnapshot } from '../interfaces/encounter-snapshot.interface';

/**
 * Spec 003 (FR-028..030) — contrato de domínio para executores de IA.
 *
 * Implementações:
 *  - `RemoteAgentExecutor`: chama `diad-agents` via HTTP (default em prod/dev).
 *  - `MockAiTurnExecutor`: decisões determinísticas para testes (NODE_ENV=test).
 *
 * O `AiTurnService` depende desta abstração (DIP); não conhece `AiProxyService`
 * nem HTTP. Ver ADR 0004 para racional completo.
 */
export abstract class AiTurnExecutor {
  abstract executeTurn(
    snapshot: EncounterSnapshot,
    participantId: string,
    opts?: AiTurnExecutorOpts,
  ): Promise<GameResult<TurnExecutionPlan>>;
}

export interface AiTurnExecutorOpts {
  /** Índice do step a partir do qual re-decidir (falha parcial — spec 003 D10). */
  continuationFrom?: number;
  /** Limite máximo de steps no plano (default 10). */
  maxSteps?: number;
}

export interface TurnExecutionPlan {
  steps: PlannedActionStep[];
  rationale?: string;
  llmCostUsd?: number;
  tookMs: number;
}
