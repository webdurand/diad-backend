import { MarkXpTriggerUseCase } from "../application/mark-xp-trigger.use-case";
import { createEmptyXpTriggerState } from "../domain/hidden-layer.types";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const PHASE_ID = "22222222-2222-4222-8222-222222222222";

describe("MarkXpTriggerUseCase", () => {
  it("é idempotente e emite xp_trigger_marked só no primeiro mark da kind", async () => {
    let state = createEmptyXpTriggerState();
    const repository = {
      getCurrent: jest.fn(async () => ({
        sessionId: SESSION_ID,
        phaseId: PHASE_ID,
        phaseIndex: 1,
        xpTriggerState: state,
      })),
      saveCurrent: jest.fn(async (input) => {
        state = input.xpTriggerState;
        return state;
      }),
    };
    const events = {
      publishXpTriggerMarked: jest.fn(async () => undefined),
    };
    const useCase = new MarkXpTriggerUseCase({ repository, events });

    await useCase.execute({
      sessionId: SESSION_ID,
      triggerKind: "objective_met",
    });
    await useCase.execute({
      sessionId: SESSION_ID,
      triggerKind: "objective_met",
    });

    expect(repository.saveCurrent).toHaveBeenCalledTimes(1);
    expect(events.publishXpTriggerMarked).toHaveBeenCalledTimes(1);
    expect(events.publishXpTriggerMarked).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        phaseId: PHASE_ID,
        triggerKind: "objective_met",
        totalMarked: 1,
      }),
    );
  });
});
