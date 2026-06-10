import { TierChronicleEntriesUseCase } from "../application/tier-chronicle-entries.use-case";
import type { ChronicleMemoryEntry } from "../domain/narrative-memory.types";

describe("TierChronicleEntriesUseCase perf", () => {
  it("mantém p95 lógico <= 1.8s para summarize de 5 entries", async () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      id: `entry-${index}`,
      campaignId: "campaign-1",
      sessionId: "session-1",
      phaseIndex: 1,
      title: `Entry ${index}`,
      content: "x".repeat(500),
      tier: "active",
      legacyTags: [],
      tierLocked: false,
      significance: 5,
    })) satisfies ChronicleMemoryEntry[];
    const useCase = new TierChronicleEntriesUseCase({
      repository: {
        findActiveByPhase: jest.fn(async () => entries),
        findDiaryReadyForForgetting: jest.fn(async () => []),
        saveAll: jest.fn(async () => undefined),
      },
      summarizer: {
        summarize: jest.fn(async () => ({
          summaries: entries.map((entry) => ({
            entryId: entry.id,
            content: "resumo",
            legacyTags: [entry.title],
          })),
          metadata: { model: "claude-haiku-4-5-20251001", latencyMs: 1_200 },
        })),
      },
      events: { publishChronicleTierChanged: jest.fn() },
    });

    const result = await useCase.executeForPhaseChanged({
      sessionId: "session-1",
      campaignId: "campaign-1",
      fromPhaseIndex: 1,
      toPhaseIndex: 2,
    });

    expect(result.summarizerLatencyMs).toBeLessThanOrEqual(1_800);
  });
});
