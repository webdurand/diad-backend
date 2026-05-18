import {
  MAX_CHRONICLE_SUMMARY_ENTRIES,
  type ChronicleMemoryEntry,
  type ChronicleSummarizeResult,
  type ChronicleTier,
} from "../domain/narrative-memory.types";

export interface TierChronicleRepositoryPort {
  findActiveByPhase(input: {
    sessionId: string;
    phaseIndex: number;
  }): Promise<ChronicleMemoryEntry[]>;
  findDiaryReadyForForgetting(input: {
    sessionId: string;
    maxPhaseIndex: number;
  }): Promise<ChronicleMemoryEntry[]>;
  saveAll(entries: ChronicleMemoryEntry[]): Promise<void>;
}

export interface ChronicleSummarizerPort {
  summarize(entries: ChronicleMemoryEntry[]): Promise<ChronicleSummarizeResult>;
}

export interface ChronicleTierEventPort {
  publishChronicleTierChanged(input: {
    sessionId: string;
    campaignId: string;
    entryIds: string[];
    fromTier: ChronicleTier;
    toTier: ChronicleTier;
    summarized: boolean;
    traceId?: string;
  }): Promise<void>;
}

export interface TierChroniclePhaseChangedInput {
  sessionId: string;
  campaignId: string;
  fromPhaseIndex: number;
  toPhaseIndex: number;
  traceId?: string;
}

export interface TierChronicleResult {
  activeToDiaryCount: number;
  diaryToForgottenCount: number;
  summarizerLatencyMs: number;
}

export class TierChronicleEntriesUseCase {
  constructor(
    private readonly deps: {
      repository: TierChronicleRepositoryPort;
      summarizer: ChronicleSummarizerPort;
      events: ChronicleTierEventPort;
      now?: () => Date;
    },
  ) {}

  async executeForPhaseChanged(
    input: TierChroniclePhaseChangedInput,
  ): Promise<TierChronicleResult> {
    const activeToDiary = await this.promoteActiveToDiary(input);
    const diaryToForgotten = await this.promoteDiaryToForgotten(input);
    return {
      activeToDiaryCount: activeToDiary.count,
      diaryToForgottenCount: diaryToForgotten.count,
      summarizerLatencyMs: activeToDiary.latencyMs,
    };
  }

  private async promoteActiveToDiary(
    input: TierChroniclePhaseChangedInput,
  ): Promise<{ count: number; latencyMs: number }> {
    const activeEntries = await this.deps.repository.findActiveByPhase({
      sessionId: input.sessionId,
      phaseIndex: input.fromPhaseIndex,
    });
    if (activeEntries.length === 0) return { count: 0, latencyMs: 0 };

    const entriesToSummarize = activeEntries.slice(
      0,
      MAX_CHRONICLE_SUMMARY_ENTRIES,
    );
    const summarized = await this.deps.summarizer.summarize(entriesToSummarize);
    const summaryById = new Map(
      summarized.summaries.map((summary) => [summary.entryId, summary]),
    );
    const now = this.now();
    const next = activeEntries.map((entry) => {
      const summary = summaryById.get(entry.id);
      return {
        ...entry,
        tier: "diary" as const,
        content: entry.tierLocked ? entry.content : (summary?.content ?? ""),
        legacyTags: normalizeLegacyTags(
          summary?.legacyTags.length ? summary.legacyTags : [entry.title],
        ),
        tieredAt: now,
        summarizerMetadata: summary
          ? {
              ...summarized.metadata,
              originalLengthChars: entry.content.length,
              summaryLengthChars: summary.content.length,
            }
          : summarized.metadata,
      };
    });

    await this.deps.repository.saveAll(next);
    await this.deps.events.publishChronicleTierChanged({
      sessionId: input.sessionId,
      campaignId: input.campaignId,
      entryIds: next.map((entry) => entry.id),
      fromTier: "active",
      toTier: "diary",
      summarized: true,
      traceId: input.traceId,
    });
    return {
      count: next.length,
      latencyMs: summarized.metadata.latencyMs,
    };
  }

  private async promoteDiaryToForgotten(
    input: TierChroniclePhaseChangedInput,
  ): Promise<{ count: number }> {
    const maxPhaseIndex = input.toPhaseIndex - 2;
    if (maxPhaseIndex < 1) return { count: 0 };

    const diaryEntries = await this.deps.repository.findDiaryReadyForForgetting(
      {
        sessionId: input.sessionId,
        maxPhaseIndex,
      },
    );
    if (diaryEntries.length === 0) return { count: 0 };

    const now = this.now();
    const next = diaryEntries.map((entry) => ({
      ...entry,
      tier: "forgotten" as const,
      content: "",
      legacyTags: normalizeLegacyTags(
        entry.legacyTags.length ? entry.legacyTags : [entry.title],
      ),
      tieredAt: now,
    }));
    await this.deps.repository.saveAll(next);
    await this.deps.events.publishChronicleTierChanged({
      sessionId: input.sessionId,
      campaignId: input.campaignId,
      entryIds: next.map((entry) => entry.id),
      fromTier: "diary",
      toTier: "forgotten",
      summarized: false,
      traceId: input.traceId,
    });
    return { count: next.length };
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}

function normalizeLegacyTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const normalized = tag.trim().replace(/\s+/g, " ");
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized.slice(0, 80));
    if (out.length >= 10) break;
  }
  return out;
}
