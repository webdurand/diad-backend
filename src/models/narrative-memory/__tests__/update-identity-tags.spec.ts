import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { UpdateIdentityTagsUseCase } from "../application/update-identity-tags.use-case";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const PC_ID = "33333333-3333-4333-8333-333333333333";
const PHASE_TRANSITION_ID = "44444444-4444-4444-8444-444444444444";

describe("UpdateIdentityTagsUseCase", () => {
  it("rejeita quando a mudança excede 5 tags totais", async () => {
    const useCase = new UpdateIdentityTagsUseCase({
      repository: makeRepository(["novato", "curioso", "endividado", "ferido"]),
      events: { publishIdentityTagsChanged: jest.fn() },
    });

    await expect(
      useCase.execute({
        sessionId: SESSION_ID,
        pcId: PC_ID,
        phaseTransitionId: PHASE_TRANSITION_ID,
        added: ["portador do pacto", "veterano de Goma"],
        removed: [],
        rationale:
          "A fase adicionou peso demais sem remover identidade antiga.",
      }),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: ErrorCode.IDENTITY_TAGS_LIMIT_EXCEEDED,
    });
  });

  it("persiste current tags e history limitado a 50 deltas", async () => {
    const repository = makeRepository(["novato"], 50);
    const events = { publishIdentityTagsChanged: jest.fn() };
    const useCase = new UpdateIdentityTagsUseCase({
      repository,
      events,
      now: () => new Date("2026-05-18T12:00:00.000Z"),
    });

    const result = await useCase.execute({
      sessionId: SESSION_ID,
      pcId: PC_ID,
      phaseTransitionId: PHASE_TRANSITION_ID,
      added: ["veterano de Goma"],
      removed: ["novato"],
      rationale: "O PC salvou Goma e deixou de ser novato.",
    });

    expect(result.currentTags).toEqual(["veterano de Goma"]);
    expect(result.history).toHaveLength(50);
    expect(result.history.at(-1)).toEqual({
      added: ["veterano de Goma"],
      removed: ["novato"],
      appliedAt: "2026-05-18T12:00:00.000Z",
      phaseTransitionId: PHASE_TRANSITION_ID,
      rationale: "O PC salvou Goma e deixou de ser novato.",
    });
    expect(repository.saveIdentityState).toHaveBeenCalledWith(PC_ID, result);
    expect(events.publishIdentityTagsChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        pcId: PC_ID,
        added: ["veterano de Goma"],
        removed: ["novato"],
        totalTagsAfter: 1,
      }),
    );
  });
});

function makeRepository(currentTags: string[], historyCount = 0) {
  const history = Array.from({ length: historyCount }, (_, index) => ({
    added: [`tag ${index}`],
    removed: [],
    appliedAt: "2026-05-17T12:00:00.000Z",
    phaseTransitionId: PHASE_TRANSITION_ID,
    rationale: `delta ${index}`,
  }));
  return {
    findIdentityState: jest.fn(async () => ({ currentTags, history })),
    saveIdentityState: jest.fn(async () => undefined),
  };
}
