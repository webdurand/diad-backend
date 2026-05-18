import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import {
  BOOKEND_SAMPLING,
  type BookendArtifactDraft,
  type BookendArtifactRecord,
  type BookendKind,
  type GeneratedBookendProse,
  type NpcStateSnapshot,
} from "../domain/bookend.types";
import type {
  DiegeticRitualKey,
  OutcomeTier,
  XpTriggerState,
} from "src/models/story-hidden-layer/domain/hidden-layer.types";

export const FALLBACK_BOOKEND_PROSE = "Capítulo encerrado.";

export interface RenderBookendInput {
  sessionId: string;
  phaseTransitionId?: string | null;
  kind: BookendKind;
  traceId?: string;
  campaignId?: string;
  recapText?: string | null;
  outcomeTier?: OutcomeTier | null;
  closingSeedFocus?: string | null;
  closingSeedCrossroad?: string | null;
  diegeticRitualResolved?: DiegeticRitualKey | null;
  hiddenSecretSeed?: string | null;
  xpTriggerState?: XpTriggerState | null;
  twoBeatRequired?: boolean;
}

export interface BookendGenerationRequest extends RenderBookendInput {
  snapshot: NpcStateSnapshot;
  retryHint?: string;
}

export interface BookendArtifactRepositoryPort {
  save(artifact: BookendArtifactDraft): Promise<BookendArtifactRecord>;
}

export interface NpcStateSnapshotPort {
  getSnapshot(sessionId: string, phaseTransitionId?: string | null): Promise<NpcStateSnapshot>;
}

export interface BookendGenerationPort {
  render(request: BookendGenerationRequest): Promise<GeneratedBookendProse>;
}

export interface BookendEventPublisherPort {
  publishReady(input: {
    artifact: BookendArtifactRecord;
    traceId?: string;
    campaignId?: string;
  }): Promise<void>;
  publishFailed(input: {
    sessionId: string;
    phaseTransitionId?: string | null;
    kind: BookendKind;
    traceId?: string;
    campaignId?: string;
    code: string;
    invalidNpcIds?: string[];
  }): Promise<void>;
}

export interface RenderBookendCeremonyDeps {
  artifactRepository: BookendArtifactRepositoryPort;
  snapshotPort: NpcStateSnapshotPort;
  generationPort: BookendGenerationPort;
  eventPublisher: BookendEventPublisherPort;
  now?: () => number;
}

export class RenderBookendCeremonyUseCase {
  constructor(private readonly deps: RenderBookendCeremonyDeps) {}

  async execute(input: RenderBookendInput): Promise<BookendArtifactRecord> {
    const startedAt = this.now();
    const snapshot = await this.deps.snapshotPort.getSnapshot(
      input.sessionId,
      input.phaseTransitionId,
    );
    const first = await this.renderOrFallback(input, snapshot, startedAt);
    if ("fallback" in first) return first.fallback;
    const firstInvalid = this.findInvalidNpcReferences(
      first.npcsReferenced,
      snapshot,
    );

    if (firstInvalid.length === 0) {
      return this.persistSuccess(input, first, startedAt, 0);
    }

    const retryHint = buildNpcRetryHint(firstInvalid);
    const second = await this.renderOrFallback(
      {
        ...input,
        retryHint,
      },
      snapshot,
      startedAt,
    );
    if ("fallback" in second) return second.fallback;
    const secondInvalid = this.findInvalidNpcReferences(
      second.npcsReferenced,
      snapshot,
    );

    if (secondInvalid.length === 0) {
      return this.persistSuccess(input, second, startedAt, 1);
    }

    return this.persistFallback(input, secondInvalid, startedAt);
  }

  private async renderOrFallback(
    input: RenderBookendInput & { retryHint?: string },
    snapshot: NpcStateSnapshot,
    startedAt: number,
  ): Promise<GeneratedBookendProse | { fallback: BookendArtifactRecord }> {
    try {
      return await this.deps.generationPort.render({ ...input, snapshot });
    } catch {
      return {
        fallback: await this.persistFallback(
          input,
          [],
          startedAt,
          ErrorCode.BOOKEND_WRITER_TIMEOUT,
        ),
      };
    }
  }

  private findInvalidNpcReferences(
    npcsReferenced: string[],
    snapshot: NpcStateSnapshot,
  ): string[] {
    const alive = new Set(snapshot.npcsAliveAtEndOfPhase);
    return npcsReferenced.filter((npcId) => !alive.has(npcId));
  }

  private async persistSuccess(
    input: RenderBookendInput,
    generated: GeneratedBookendProse,
    startedAt: number,
    retries: number,
  ): Promise<BookendArtifactRecord> {
    const artifact = await this.deps.artifactRepository.save({
      gameSessionId: input.sessionId,
      phaseTransitionId: input.phaseTransitionId ?? null,
      kind: input.kind,
      prose: generated.text,
      npcsReferenced: generated.npcsReferenced,
      metadata: {
        ...generated.metadata,
        sampling: generated.metadata.sampling ?? BOOKEND_SAMPLING[input.kind],
        latencyMs: this.elapsedSince(startedAt, generated.metadata.latencyMs),
        plannerPayloadSnapshot: generated.plannerPayload,
        toolUseRetries: retries,
      },
      skippedByUser: false,
    });

    await this.deps.eventPublisher.publishReady({
      artifact,
      traceId: input.traceId,
      campaignId: input.campaignId,
    });
    return artifact;
  }

  private async persistFallback(
    input: RenderBookendInput,
    invalidNpcIds: string[],
    startedAt: number,
    code: string = ErrorCode.BOOKEND_NPC_REFERENCE_VIOLATION,
  ): Promise<BookendArtifactRecord> {
    const artifact = await this.deps.artifactRepository.save({
      gameSessionId: input.sessionId,
      phaseTransitionId: input.phaseTransitionId ?? null,
      kind: input.kind,
      prose: FALLBACK_BOOKEND_PROSE,
      npcsReferenced: [],
      metadata: {
        model: "fallback",
        sampling: BOOKEND_SAMPLING[input.kind],
        latencyMs: this.elapsedSince(startedAt),
        plannerCacheHit: false,
        writerCacheHit: false,
        toolUseRetries: 1,
      },
      skippedByUser: false,
    });

    await this.deps.eventPublisher.publishFailed({
      sessionId: input.sessionId,
      phaseTransitionId: input.phaseTransitionId ?? null,
      kind: input.kind,
      traceId: input.traceId,
      campaignId: input.campaignId,
      code,
      invalidNpcIds,
    });
    return artifact;
  }

  private elapsedSince(startedAt: number, preferred?: number): number {
    if (typeof preferred === "number") return preferred;
    return Math.max(0, this.now() - startedAt);
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }
}

function buildNpcRetryHint(invalidNpcIds: string[]): string {
  return (
    "Sua chamada anterior referenciou NPCs não-vivos no fim da fase: " +
    `${invalidNpcIds.join(", ")}. Esses NPCs morreram nesta fase ou em fases ` +
    "anteriores. Re-renderize a prosa SEM referenciar esses NPCs pelo nome."
  );
}
