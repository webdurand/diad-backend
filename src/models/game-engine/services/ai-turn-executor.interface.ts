import type { GameResult } from "../interfaces/result.type";
import type { PlannedActionStep } from "../interfaces/combat.interfaces";
import type { EncounterSnapshot } from "../interfaces/encounter-snapshot.interface";


export abstract class AiTurnExecutor {
  abstract executeTurn(
    snapshot: EncounterSnapshot,
    participantId: string,
    opts?: AiTurnExecutorOpts,
  ): Promise<GameResult<TurnExecutionPlan>>;
}

export interface AiTurnExecutorOpts {

  continuationFrom?: number;

  maxSteps?: number;
}

export interface TurnExecutionPlan {
  steps: PlannedActionStep[];
  rationale?: string;
  llmCostUsd?: number;
  tookMs: number;
}
