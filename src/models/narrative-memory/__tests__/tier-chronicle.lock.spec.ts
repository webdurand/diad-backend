import { TierChronicleEntriesUseCase } from "../application/tier-chronicle-entries.use-case";
import type { ChronicleMemoryEntry } from "../domain/narrative-memory.types";

describe("TierChronicleEntriesUseCase tier lock", () => {
  it("não demove tierLocked=true para forgotten", async () => {
    const unlocked = makeEntry("unlocked", false);
    const locked = makeEntry("locked", true);
    const repository = {
      findActiveByPhase: jest.fn(async () => []),
      findDiaryReadyForForgetting: jest.fn(async () => [unlocked]),
      saveAll: jest.fn(async () => undefined),
    };
    const useCase = new TierChronicleEntriesUseCase({
      repository,
      summarizer: { summarize: jest.fn() },
      events: { publishChronicleTierChanged: jest.fn() },
    });

    await useCase.executeForPhaseChanged({
      sessionId: "session-1",
      campaignId: "campaign-1",
      fromPhaseIndex: 2,
      toPhaseIndex: 3,
    });

    expect(repository.findDiaryReadyForForgetting).toHaveBeenCalledWith({
      sessionId: "session-1",
      maxPhaseIndex: 1,
    });
    expect(repository.saveAll).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "unlocked",
        tier: "forgotten",
        content: "",
      }),
    ]);
    expect(
      (repository.saveAll as jest.Mock).mock.calls
        .flat()
        .flat()
        .some((item: ChronicleMemoryEntry) => item.id === locked.id),
    ).toBe(false);
  });
});

function makeEntry(id: string, tierLocked: boolean): ChronicleMemoryEntry {
  return {
    id,
    campaignId: "campaign-1",
    sessionId: "session-1",
    phaseIndex: 1,
    title: id,
    content: `conteúdo ${id}`,
    tier: "diary",
    legacyTags: [`legado ${id}`],
    tierLocked,
    significance: 5,
  };
}
