import { CommitClosingSeedUseCase } from "../application/commit-closing-seed.use-case";
import type { ClosingSeedSnapshot } from "../domain/hidden-layer.types";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const PHASE_ID = "22222222-2222-4222-8222-222222222222";

function makeSeed(): ClosingSeedSnapshot {
  return {
    focus: "A dívida moral com Helena cobra preço",
    crossroad:
      "Maguin escolhe entre salvar o livro proibido ou salvar Helena da maldição?",
    diegeticRitualHint: "vigil",
    biasedOutcomeTier: "BITTERSWEET",
    hiddenSecretSeed: "O livro contém o verdadeiro nome de Mara.",
    commitedAtPhaseIndex: 1,
    generatedAt: "2026-05-18T12:00:00.000Z",
    plannerMetadata: {
      model: "claude-haiku-4-5-20251001",
      temperature: 0.4,
      latencyMs: 100,
      cacheHit: false,
    },
  };
}

describe("CommitClosingSeedUseCase", () => {
  it("persiste Phase.closingSeed e chama planner Haiku com cache ephemeral 1h", async () => {
    const seed = makeSeed();
    const repository = {
      findPhaseForOpening: jest.fn(async () => ({
        id: PHASE_ID,
        index: 1,
        name: "O Chamado",
        description: "A fase inicial.",
        emotionalArc: "rise",
        transitionBeatNarrativeSeed: "A primeira pista ganha peso.",
        closingSeed: null,
      })),
      saveClosingSeed: jest.fn(async () => undefined),
    };
    const planner = {
      plan: jest.fn(async () => seed),
    };
    const events = {
      publishPhaseOpened: jest.fn(async () => undefined),
    };
    const useCase = new CommitClosingSeedUseCase({
      repository,
      planner,
      events,
      now: () => new Date("2026-05-18T12:00:00.000Z"),
    });

    await useCase.execute({
      sessionId: SESSION_ID,
      campaignId: "campaign-1",
      phaseId: PHASE_ID,
      phaseIndex: 1,
      traceId: "0af7651916cd43dd8448eb211c80319c",
    });

    expect(planner.plan).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheControl: { type: "ephemeral", ttl: "1h" },
      }),
    );
    expect(repository.saveClosingSeed).toHaveBeenCalledWith(PHASE_ID, seed);
    expect(events.publishPhaseOpened).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        phaseId: PHASE_ID,
        phaseIndex: 1,
      }),
    );
  });
});
