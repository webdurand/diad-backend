import { RollChaosFactorUseCase } from "../application/roll-chaos-factor.use-case";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";

describe("RollChaosFactorUseCase", () => {
  it.each([
    ["TRIUMPH", 5, 4],
    ["BITTERSWEET", 5, 5],
    ["COSTLY", 5, 6],
    ["FAILURE", 5, 6],
    ["TRIUMPH", 1, 1],
    ["FAILURE", 9, 9],
  ] as const)(
    "aplica outcome %s em chaosFactor %i -> %i com clamp 1..9",
    async (outcomeTier, currentFactor, expectedFactor) => {
      const repository = makeRepository(currentFactor);
      const events = { publishChaosFactorEvolved: jest.fn() };
      const useCase = new RollChaosFactorUseCase({ repository, events });

      const result = await useCase.execute({
        sessionId: SESSION_ID,
        outcomeTier,
      });

      expect(result.oldFactor).toBe(currentFactor);
      expect(result.newFactor).toBe(expectedFactor);
      expect(repository.saveChaosFactor).toHaveBeenCalledWith(
        SESSION_ID,
        expectedFactor,
      );
      expect(events.publishChaosFactorEvolved).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: SESSION_ID,
          campaignId: CAMPAIGN_ID,
          oldFactor: currentFactor,
          newFactor: expectedFactor,
          cause: "phase_outcome",
        }),
      );
    },
  );
});

function makeRepository(chaosFactor: number) {
  return {
    findSession: jest.fn(async () => ({
      id: SESSION_ID,
      campaignId: CAMPAIGN_ID,
      chaosFactor,
    })),
    saveChaosFactor: jest.fn(async () => undefined),
  };
}
