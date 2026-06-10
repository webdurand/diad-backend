import { CommitClosingSeedUseCase } from "../application/commit-closing-seed.use-case";
import type { ClosingSeedSnapshot } from "../domain/hidden-layer.types";

function seed(): ClosingSeedSnapshot {
  return {
    focus: "A dívida moral com Helena cobra preço",
    crossroad:
      "Maguin escolhe entre salvar o livro proibido ou salvar Helena da maldição?",
    diegeticRitualHint: "vigil",
    biasedOutcomeTier: "BITTERSWEET",
    hiddenSecretSeed: null,
    commitedAtPhaseIndex: 1,
    generatedAt: new Date().toISOString(),
  };
}

describe("CommitClosingSeedUseCase performance", () => {
  it("mantém p95 abaixo de 1.5s com planner e persistência", async () => {
    const durations: number[] = [];
    const useCase = new CommitClosingSeedUseCase({
      repository: {
        findPhaseForOpening: jest.fn(async () => ({
          id: "phase-1",
          index: 1,
          name: "O Chamado",
          description: null,
          emotionalArc: "rise",
          transitionBeatNarrativeSeed: null,
          closingSeed: null,
        })),
        saveClosingSeed: jest.fn(async () => undefined),
      },
      planner: {
        plan: jest.fn(async () => seed()),
      },
      events: {
        publishPhaseOpened: jest.fn(async () => undefined),
      },
    });

    for (let index = 0; index < 5; index += 1) {
      const startedAt = performance.now();
      await useCase.execute({
        sessionId: `session-${index}`,
        phaseId: "phase-1",
        phaseIndex: 1,
      });
      durations.push(performance.now() - startedAt);
    }

    const p95 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)];
    expect(p95).toBeLessThanOrEqual(1500);
  });
});
