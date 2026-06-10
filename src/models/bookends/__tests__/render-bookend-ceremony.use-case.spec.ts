import {
  FALLBACK_BOOKEND_PROSE,
  RenderBookendCeremonyUseCase,
  type RenderBookendCeremonyDeps,
} from "../application/render-bookend-ceremony.use-case";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const TRANSITION_ID = "22222222-2222-4222-8222-222222222222";
const ALIVE_NPC_ID = "33333333-3333-4333-8333-333333333333";
const DEAD_NPC_ID = "44444444-4444-4444-8444-444444444444";

function makeDeps(
  renders: Array<{ text: string; npcsReferenced: string[] }>,
): RenderBookendCeremonyDeps {
  return {
    artifactRepository: {
      save: jest.fn(async (artifact) => ({
        id: "artifact-1",
        ...artifact,
        createdAt: new Date("2026-05-16T12:00:00.000Z"),
      })),
    },
    snapshotPort: {
      getSnapshot: jest.fn(async () => ({
        npcsAliveAtEndOfPhase: [ALIVE_NPC_ID],
        npcsDeadDuringPhase: [DEAD_NPC_ID],
      })),
    },
    generationPort: {
      render: jest.fn(async () => {
        const next = renders.shift();
        if (!next) throw new Error("sem render fake");
        return {
          ...next,
          plannerPayload: {
            kind: "outro",
            narrativeBeat: "A fase cobra seu preco.",
            sensoryAnchor: "o sino rachado",
            openThreads: [],
            npcsReferenceable: [ALIVE_NPC_ID],
            archetypeKey: "threshold_echo",
          },
          metadata: {
            model: "claude-sonnet-4-5-20251001",
            sampling: { temperature: 0.6, topP: 0.9, maxTokens: 800 },
            latencyMs: 42,
            plannerCacheHit: false,
            writerCacheHit: false,
          },
        };
      }),
    },
    eventPublisher: {
      publishReady: jest.fn(async () => undefined),
      publishFailed: jest.fn(async () => undefined),
    },
  };
}

function makeThrowingDeps(): RenderBookendCeremonyDeps {
  const deps = makeDeps([]);
  deps.generationPort.render = jest.fn(async () => {
    throw new Error("agents down");
  });
  return deps;
}

describe("RenderBookendCeremonyUseCase", () => {
  it("rejeita NPC fora do snapshot, retenta 1x com hint e persiste sucesso", async () => {
    const deps = makeDeps([
      { text: "Helena observa a porta fechada.", npcsReferenced: [DEAD_NPC_ID] },
      { text: "O sino rachado vibra no fim da rua.", npcsReferenced: [ALIVE_NPC_ID] },
    ]);
    const useCase = new RenderBookendCeremonyUseCase(deps);

    const artifact = await useCase.execute({
      sessionId: SESSION_ID,
      phaseTransitionId: TRANSITION_ID,
      kind: "outro",
      traceId: "0af7651916cd43dd8448eb211c80319c",
    });

    expect(artifact.prose).toBe("O sino rachado vibra no fim da rua.");
    expect(deps.generationPort.render).toHaveBeenCalledTimes(2);
    expect(deps.generationPort.render).toHaveBeenLastCalledWith(
      expect.objectContaining({
        retryHint: expect.stringContaining(DEAD_NPC_ID),
      }),
    );
    expect(deps.artifactRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ toolUseRetries: 1 }),
      }),
    );
    expect(deps.eventPublisher.publishReady).toHaveBeenCalledWith(
      expect.objectContaining({ artifact: expect.objectContaining({ id: "artifact-1" }) }),
    );
  });

  it("falha na segunda violacao e emite fallback minimo + bookend_failed", async () => {
    const deps = makeDeps([
      { text: "Helena volta para brindar.", npcsReferenced: [DEAD_NPC_ID] },
      { text: "Helena volta outra vez.", npcsReferenced: [DEAD_NPC_ID] },
    ]);
    const useCase = new RenderBookendCeremonyUseCase(deps);

    const artifact = await useCase.execute({
      sessionId: SESSION_ID,
      phaseTransitionId: TRANSITION_ID,
      kind: "outro",
      traceId: "0af7651916cd43dd8448eb211c80319c",
    });

    expect(artifact.prose).toBe(FALLBACK_BOOKEND_PROSE);
    expect(artifact.npcsReferenced).toEqual([]);
    expect(deps.eventPublisher.publishFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "BOOKEND_NPC_REFERENCE_VIOLATION",
        invalidNpcIds: [DEAD_NPC_ID],
      }),
    );
  });

  it("gera fallback minimo quando agents falha antes do tool-use", async () => {
    const deps = makeThrowingDeps();
    const useCase = new RenderBookendCeremonyUseCase(deps);

    const artifact = await useCase.execute({
      sessionId: SESSION_ID,
      phaseTransitionId: TRANSITION_ID,
      kind: "outro",
    });

    expect(artifact.prose).toBe(FALLBACK_BOOKEND_PROSE);
    expect(deps.eventPublisher.publishFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "BOOKEND_WRITER_TIMEOUT",
        invalidNpcIds: [],
      }),
    );
  });
});
