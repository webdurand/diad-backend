import { EvolveDowntimeUseCase } from "../application/evolve-downtime.use-case";

describe("EvolveDowntimeUseCase", () => {
  it.each([
    [1, "expected", 1],
    [3, "expected", 1],
    [4, "altered", 2],
    [6, "altered", 2],
    [7, "interrupt", 3],
    [9, "interrupt", 3],
  ] as const)(
    "gera downtime chaosFactor=%i como %s com %i turnos",
    async (chaosFactor, archetypeChosen, turnsCount) => {
      const repository = { saveTurns: jest.fn(async (turns) => turns) };
      const events = { publishDowntimeExecuted: jest.fn() };
      const useCase = new EvolveDowntimeUseCase({ repository, events });

      const result = await useCase.execute({
        sessionId: "session-1",
        campaignId: "campaign-1",
        phaseTransitionId: "transition-1",
        chaosFactor,
      });

      expect(result.archetypeChosen).toBe(archetypeChosen);
      expect(result.turns).toHaveLength(turnsCount);
      expect(repository.saveTurns).toHaveBeenCalledWith(result.turns);
      expect(events.publishDowntimeExecuted).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          phaseTransitionId: "transition-1",
          turnsCount,
          archetypeChosen,
          chaosFactor,
        }),
      );
    },
  );
});
