import { BookendArtifactService } from "../services/bookend-artifact.service";

describe("BookendArtifactService", () => {
  it("does not expose plannerPayloadSnapshot in public DTO metadata", async () => {
    const artifact = {
      id: "bookend-1",
      gameSessionId: "session-1",
      phaseTransitionId: "phase-1",
      kind: "outro",
      prose: "O sino rachado toca uma vez.",
      npcsReferenced: [],
      metadata: {
        model: "claude-sonnet",
        sampling: { temperature: 0.6, topP: 0.9, maxTokens: 800 },
        latencyMs: 1200,
        plannerPayloadSnapshot: {
          narrativeBeat: "audit-only",
          openThreads: ["segredo interno"],
        },
      },
      skippedByUser: false,
      createdAt: new Date("2026-05-17T12:00:00.000Z"),
    };
    const service = new BookendArtifactService(
      {
        find: jest.fn(async () => [artifact]),
      } as any,
      {} as any,
    );

    const [dto] = await service.listBySession("session-1");

    expect(dto.metadata).toEqual({
      model: "claude-sonnet",
      sampling: { temperature: 0.6, topP: 0.9, maxTokens: 800 },
      latencyMs: 1200,
    });
  });
});
