import { TierChronicleEntriesUseCase } from "../application/tier-chronicle-entries.use-case";
import type { ChronicleMemoryEntry } from "../domain/narrative-memory.types";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";

describe("TierChronicleEntriesUseCase", () => {
  it("move active->diary com summarize Haiku limitado a 5 entries", async () => {
    const entries = Array.from({ length: 7 }, (_, index) =>
      entry({ id: `entry-${index + 1}`, tier: "active", phaseIndex: 1 }),
    );
    const repository = makeRepository(entries);
    const summarizer = {
      summarize: jest.fn(async (input: ChronicleMemoryEntry[]) => ({
        summaries: input.map((item) => ({
          entryId: item.id,
          content: `Resumo de ${item.title}`,
          legacyTags: [`legado ${item.id}`],
        })),
        metadata: { model: "claude-haiku-4-5-20251001", latencyMs: 900 },
      })),
    };
    const events = { publishChronicleTierChanged: jest.fn() };
    const useCase = new TierChronicleEntriesUseCase({
      repository,
      summarizer,
      events,
      now: () => new Date("2026-05-18T12:00:00.000Z"),
    });

    await useCase.executeForPhaseChanged({
      sessionId: SESSION_ID,
      campaignId: CAMPAIGN_ID,
      fromPhaseIndex: 1,
      toPhaseIndex: 2,
    });

    expect(summarizer.summarize).toHaveBeenCalledWith(entries.slice(0, 5));
    expect(repository.saveAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "entry-1",
          tier: "diary",
          content: "Resumo de Título entry-1",
          legacyTags: ["legado entry-1"],
        }),
        expect.objectContaining({
          id: "entry-7",
          tier: "diary",
          content: "",
          legacyTags: ["Título entry-7"],
        }),
      ]),
    );
    expect(events.publishChronicleTierChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        fromTier: "active",
        toTier: "diary",
        summarized: true,
      }),
    );
  });
});

function entry(partial: Partial<ChronicleMemoryEntry>): ChronicleMemoryEntry {
  const id = partial.id ?? "entry-1";
  return {
    id,
    campaignId: CAMPAIGN_ID,
    sessionId: SESSION_ID,
    phaseIndex: 1,
    title: `Título ${id}`,
    content: `Conteúdo completo ${id}`,
    tier: "active",
    legacyTags: [],
    tierLocked: false,
    significance: 5,
    ...partial,
  };
}

function makeRepository(entries: ChronicleMemoryEntry[]) {
  return {
    findActiveByPhase: jest.fn(async () =>
      entries.filter((item) => item.tier === "active"),
    ),
    findDiaryReadyForForgetting: jest.fn(async () =>
      entries.filter((item) => item.tier === "diary" && !item.tierLocked),
    ),
    saveAll: jest.fn(async () => undefined),
  };
}
