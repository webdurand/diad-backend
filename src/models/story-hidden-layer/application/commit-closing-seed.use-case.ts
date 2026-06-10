import type { PhaseEmotionalArc } from "src/entities/phase.entity";
import type {
  ClosingSeedSnapshot,
  DiegeticRitualKey,
  OutcomeTier,
} from "../domain/hidden-layer.types";

export interface PhaseOpeningRecord {
  id: string;
  index: number;
  name: string;
  description?: string | null;
  emotionalArc: PhaseEmotionalArc;
  transitionBeatNarrativeSeed?: string | null;
  closingSeed?: ClosingSeedSnapshot | null;
}

export interface ClosingSeedPlanningInput {
  sessionId: string;
  phaseId: string;
  phaseIndex: number;
  phaseName: string;
  phaseDescription?: string | null;
  emotionalArc: PhaseEmotionalArc;
  transitionBeatNarrativeSeed?: string | null;
  cacheControl: { type: "ephemeral"; ttl: "1h" };
}

export interface ClosingSeedRepositoryPort {
  findPhaseForOpening(input: {
    phaseId?: string | null;
    storyArcId?: string | null;
    phaseIndex: number;
  }): Promise<PhaseOpeningRecord | null>;
  saveClosingSeed(phaseId: string, closingSeed: ClosingSeedSnapshot): Promise<void>;
}

export interface ClosingSeedPlannerPort {
  plan(input: ClosingSeedPlanningInput): Promise<ClosingSeedSnapshot>;
}

export interface ClosingSeedEventPort {
  publishPhaseOpened(input: {
    sessionId: string;
    campaignId?: string | null;
    phaseId: string;
    phaseIndex: number;
    closingSeedCommittedAt: string;
    traceId?: string;
  }): Promise<void>;
}

export interface CommitClosingSeedDeps {
  repository: ClosingSeedRepositoryPort;
  planner: ClosingSeedPlannerPort;
  events: ClosingSeedEventPort;
  now?: () => Date;
}

export interface CommitClosingSeedInput {
  sessionId: string;
  campaignId?: string | null;
  phaseId?: string | null;
  storyArcId?: string | null;
  phaseIndex: number;
  traceId?: string;
}

export class CommitClosingSeedUseCase {
  constructor(private readonly deps: CommitClosingSeedDeps) {}

  async execute(input: CommitClosingSeedInput): Promise<ClosingSeedSnapshot | null> {
    const phase = await this.deps.repository.findPhaseForOpening({
      phaseId: input.phaseId ?? null,
      storyArcId: input.storyArcId ?? null,
      phaseIndex: input.phaseIndex,
    });
    if (!phase) return null;

    if (phase.closingSeed) {
      return phase.closingSeed;
    }

    const planned = await this.deps.planner.plan({
      sessionId: input.sessionId,
      phaseId: phase.id,
      phaseIndex: phase.index,
      phaseName: phase.name,
      phaseDescription: phase.description ?? null,
      emotionalArc: phase.emotionalArc,
      transitionBeatNarrativeSeed: phase.transitionBeatNarrativeSeed ?? null,
      cacheControl: { type: "ephemeral", ttl: "1h" },
    });
    const closingSeed = this.normalizeSeed(planned, phase.index);
    await this.deps.repository.saveClosingSeed(phase.id, closingSeed);
    await this.deps.events.publishPhaseOpened({
      sessionId: input.sessionId,
      campaignId: input.campaignId ?? null,
      phaseId: phase.id,
      phaseIndex: phase.index,
      closingSeedCommittedAt: closingSeed.generatedAt,
      traceId: input.traceId,
    });
    return closingSeed;
  }

  private normalizeSeed(
    seed: ClosingSeedSnapshot,
    phaseIndex: number,
  ): ClosingSeedSnapshot {
    return {
      ...seed,
      focus: seed.focus.trim(),
      crossroad: seed.crossroad.trim(),
      diegeticRitualHint: seed.diegeticRitualHint as DiegeticRitualKey,
      biasedOutcomeTier: seed.biasedOutcomeTier as OutcomeTier,
      hiddenSecretSeed: seed.hiddenSecretSeed?.trim() || null,
      commitedAtPhaseIndex: seed.commitedAtPhaseIndex ?? phaseIndex,
      generatedAt: seed.generatedAt || this.now().toISOString(),
    };
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}
