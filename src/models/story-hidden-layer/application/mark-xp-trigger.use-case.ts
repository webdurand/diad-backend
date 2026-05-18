import {
  countMarkedXpTriggers,
  normalizeXpTriggerState,
  type XpTriggerKind,
  type XpTriggerState,
} from "../domain/hidden-layer.types";

export interface ActiveXpTriggerState {
  sessionId: string;
  phaseId: string;
  phaseIndex: number;
  xpTriggerState: XpTriggerState;
}

export interface MarkXpTriggerRepositoryPort {
  getCurrent(sessionId: string): Promise<ActiveXpTriggerState>;
  saveCurrent(input: ActiveXpTriggerState): Promise<XpTriggerState>;
}

export interface MarkXpTriggerEventPort {
  publishXpTriggerMarked(input: {
    sessionId: string;
    phaseId?: string | null;
    phaseIndex: number;
    triggerKind: XpTriggerKind;
    totalMarked: number;
    traceId?: string;
  }): Promise<void>;
}

export interface MarkXpTriggerDeps {
  repository: MarkXpTriggerRepositoryPort;
  events: MarkXpTriggerEventPort;
}

export interface MarkXpTriggerInput {
  sessionId: string;
  triggerKind: XpTriggerKind;
  traceId?: string;
}

export class MarkXpTriggerUseCase {
  constructor(private readonly deps: MarkXpTriggerDeps) {}

  async execute(input: MarkXpTriggerInput): Promise<XpTriggerState> {
    const current = await this.deps.repository.getCurrent(input.sessionId);
    const xpTriggerState = normalizeXpTriggerState(current.xpTriggerState);

    if (xpTriggerState[input.triggerKind]) {
      return xpTriggerState;
    }

    const next = {
      ...xpTriggerState,
      [input.triggerKind]: true,
    };
    await this.deps.repository.saveCurrent({
      ...current,
      xpTriggerState: next,
    });
    await this.deps.events.publishXpTriggerMarked({
      sessionId: input.sessionId,
      phaseId: current.phaseId,
      phaseIndex: current.phaseIndex,
      triggerKind: input.triggerKind,
      totalMarked: countMarkedXpTriggers(next),
      traceId: input.traceId,
    });
    return next;
  }
}
