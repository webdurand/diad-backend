import {
  RenderBookendCeremonyUseCase,
  type RenderBookendCeremonyDeps,
} from "../application/render-bookend-ceremony.use-case";

describe("RenderBookendCeremonyUseCase perf", () => {
  it("fica abaixo de 2.5s com planner/writer dentro do budget", async () => {
    const deps: RenderBookendCeremonyDeps = {
      artifactRepository: {
        save: jest.fn(async (artifact) => ({
          id: "artifact-fast",
          ...artifact,
          createdAt: new Date(),
        })),
      },
      snapshotPort: {
        getSnapshot: jest.fn(async () => ({
          npcsAliveAtEndOfPhase: [],
          npcsDeadDuringPhase: [],
        })),
      },
      generationPort: {
        render: jest.fn(async () => ({
          text: "A porta se fecha, e o metal frio guarda a ultima nota.",
          npcsReferenced: [],
          plannerPayload: {
            kind: "outro",
            narrativeBeat: "A porta fecha a fase.",
            sensoryAnchor: "metal frio",
            openThreads: [],
            npcsReferenceable: [],
            archetypeKey: "threshold_echo",
          },
          metadata: {
            model: "claude-sonnet-4-5-20251001",
            sampling: { temperature: 0.6, topP: 0.9, maxTokens: 800 },
            latencyMs: 1200,
          },
        })),
      },
      eventPublisher: {
        publishReady: jest.fn(async () => undefined),
        publishFailed: jest.fn(async () => undefined),
      },
      now: (() => {
        const values = [0, 2400];
        return () => values.shift() ?? 2400;
      })(),
    };
    const useCase = new RenderBookendCeremonyUseCase(deps);

    const artifact = await useCase.execute({
      sessionId: "sess-1",
      phaseTransitionId: "transition-1",
      kind: "outro",
      traceId: "0af7651916cd43dd8448eb211c80319c",
    });

    expect(artifact.metadata.latencyMs).toBeLessThanOrEqual(2500);
  });
});
