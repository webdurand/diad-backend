import { AgentBookendGenerationService } from "../services/agent-bookend-generation.service";

describe("AgentBookendGenerationService", () => {
  it("uses a timeout long enough for live bookend writer calls", async () => {
    const outbound = {
      request: jest.fn(async () => ({
        text: "A porta fecha devagar e a fase fica para trás.",
        npcsReferenced: [],
        plannerPayload: {
          kind: "previously_on",
          narrativeBeat: "Retomar",
          sensoryAnchor: "porta",
          openThreads: [],
          npcsReferenceable: [],
          archetypeKey: "previously_on_cliffhanger",
        },
        metadata: { model: "stub", latencyMs: 0 },
      })),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === "AGENT_BASE_URL") return "http://agents.local";
        if (key === "INTERNAL_AGENTS_TOKEN") return "secret";
        return undefined;
      }),
    };
    const service = new AgentBookendGenerationService(outbound as any, config as any);

    await service.render({
      sessionId: "session-1",
      phaseTransitionId: "phase-1",
      kind: "previously_on",
      snapshot: { npcsAliveAtEndOfPhase: [], npcsDeadDuringPhase: [] },
    });

    expect(outbound.request).toHaveBeenCalledWith(
      "http://agents.local/internal/bookends/render",
      expect.objectContaining({ timeoutMs: 8000 }),
    );
  });
});
