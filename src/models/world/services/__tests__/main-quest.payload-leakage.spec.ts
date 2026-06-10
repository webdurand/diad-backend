import { PhaseService } from "../phase.service";

function makeService(): PhaseService {
  return new PhaseService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe("GET /sessions/:id/main-quest payload hidden layer leakage", () => {
  it("o mapper público de PhaseDto não expõe closingSeed nem hiddenSecretSeed", () => {
    const service = makeService();

    const dto = (service as any).toPhaseDto({
      id: "phase-1",
      storyArcId: "arc-1",
      index: 1,
      name: "O Chamado",
      description: null,
      emotionalArc: "rise",
      arcBeats: ["YOU"],
      unlockConditions: { any: [] },
      completionConditions: { any: [] },
      transitionBeatNarrativeSeed: null,
      deprecatesOnAdvance: {
        lostObjectives: [],
        migratingNpcs: [],
        deprecatedPois: [],
      },
      isReversible: false,
      closingSeed: {
        focus: "A dívida moral com Helena cobra preço",
        hiddenSecretSeed: "O nome verdadeiro de Mara está no livro.",
      },
      createdAt: new Date("2026-05-18T12:00:00.000Z"),
      updatedAt: new Date("2026-05-18T12:00:00.000Z"),
    });

    const payload = JSON.stringify(dto);
    expect(payload).not.toContain("closingSeed");
    expect(payload).not.toContain("hiddenSecretSeed");
    expect(payload).not.toContain("Mara");
  });
});
