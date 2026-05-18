import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import type { OutcomeTier } from "src/models/story-hidden-layer/domain/hidden-layer.types";
import {
  chaosDeltaForOutcome,
  clampChaosFactor,
  type ChaosFactorCause,
} from "../domain/narrative-memory.types";

export interface ChaosFactorSessionRecord {
  id: string;
  campaignId?: string | null;
  chaosFactor: number;
}

export interface ChaosFactorRepositoryPort {
  findSession(sessionId: string): Promise<ChaosFactorSessionRecord | null>;
  saveChaosFactor(sessionId: string, newFactor: number): Promise<void>;
}

export interface ChaosFactorEventPort {
  publishChaosFactorEvolved(input: {
    sessionId: string;
    campaignId?: string | null;
    oldFactor: number;
    newFactor: number;
    cause: ChaosFactorCause;
    traceId?: string;
  }): Promise<void>;
}

export interface RollChaosFactorInput {
  sessionId: string;
  outcomeTier: OutcomeTier;
  cause?: ChaosFactorCause;
  traceId?: string;
}

export interface RollChaosFactorResult {
  sessionId: string;
  oldFactor: number;
  newFactor: number;
  delta: -1 | 0 | 1;
}

export class RollChaosFactorUseCase {
  constructor(
    private readonly deps: {
      repository: ChaosFactorRepositoryPort;
      events: ChaosFactorEventPort;
    },
  ) {}

  async execute(input: RollChaosFactorInput): Promise<RollChaosFactorResult> {
    const session = await this.deps.repository.findSession(input.sessionId);
    if (!session) {
      throw new DomainException(
        ErrorCode.SESSION_NOT_FOUND,
        `GameSession ${input.sessionId} não encontrada.`,
      );
    }

    const delta = chaosDeltaForOutcome(input.outcomeTier);
    const oldFactor = clampChaosFactor(session.chaosFactor);
    const newFactor = clampChaosFactor(oldFactor + delta);

    if (newFactor < 1 || newFactor > 9) {
      throw new DomainException(
        ErrorCode.CHAOS_FACTOR_CLAMP_VIOLATION,
        "chaosFactor ficou fora de [1,9] após clamp.",
        { context: { oldFactor, newFactor, delta } },
      );
    }

    await this.deps.repository.saveChaosFactor(input.sessionId, newFactor);
    await this.deps.events.publishChaosFactorEvolved({
      sessionId: input.sessionId,
      campaignId: session.campaignId ?? null,
      oldFactor,
      newFactor,
      cause: input.cause ?? "phase_outcome",
      traceId: input.traceId,
    });

    return { sessionId: input.sessionId, oldFactor, newFactor, delta };
  }
}
