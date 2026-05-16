import { BookendDecisionService } from "../services/bookend-decision.service";
import { BookendOrchestrator } from "../application/bookend-orchestrator";
import type { EventEnvelope } from "src/common/event-bus/event-envelope.types";

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const TRANSITION_ID = "22222222-2222-4222-8222-222222222222";

function makeEnvelope(): EventEnvelope {
  return {
    eventId: "phase-event-1",
    version: 1,
    aggregateId: SESSION_ID,
    timestamp: "2026-05-16T12:00:00.000Z",
    eventCategory: "WorldEvent",
    eventType: "phase_changed",
    source: { service: "diad-backend", module: "test", traceId: TRACE_ID },
    scope: { campaignId: "camp-1", sessionId: SESSION_ID },
    payload: {
      phaseTransitionId: TRANSITION_ID,
      fromPhase: { index: 1, name: "O Chamado", arcBeats: ["YOU", "NEED"] },
      toPhase: { index: 2, name: "A Travessia" },
      gapMinutes: 31,
      sceneNumber: 2,
    },
    audiences: ["HUD"],
  };
}

describe("BookendOrchestrator", () => {
  it("emite phase_completed antes de bookend_ready e serializa outro -> silence -> intro -> previously", async () => {
    const order: string[] = [];
    const renderUseCase = {
      execute: jest.fn(async ({ kind }) => {
        order.push(kind);
        return { id: `artifact-${kind}`, kind, prose: kind } as any;
      }),
    };
    const orchestrator = new BookendOrchestrator({
      decisionService: new BookendDecisionService(),
      renderUseCase,
      previouslyOnUseCase: {
        execute: jest.fn(async () => ({
          prose: "Anteriormente, o sino rachou.",
          source: "rewrapped",
        })),
      },
      eventPublisher: {
        publishPhaseCompleted: jest.fn(async () => {
          order.push("phase_completed");
        }),
        publishPreviouslyShown: jest.fn(async () => {
          order.push("previously_on_shown");
        }),
      },
      sleep: jest.fn(async (ms: number) => {
        order.push(`silence:${ms}`);
      }),
    });

    await orchestrator.renderForPhaseChanged(makeEnvelope());

    expect(order).toEqual([
      "phase_completed",
      "outro",
      "silence:2000",
      "intro",
      "previously_on",
      "previously_on_shown",
    ]);
    expect(renderUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "outro", traceId: TRACE_ID }),
    );
  });
});
