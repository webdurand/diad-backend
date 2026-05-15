import { PhaseService } from "../phase.service";
import { QuestObjectiveEntity } from "src/entities/quest-objective.entity";

function makeService(): PhaseService {
  return new PhaseService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe("PhaseService", () => {
  it("returns pending when at least one OR unlock condition is met", () => {
    const service = makeService();

    const result = service.evaluateGate(
      {
        any: [
          { objective_completed: "objective-a" },
          { clock_filled: "clock-a" },
        ],
      },
      {
        objectiveStatuses: new Map([["objective-a", "completed"]]),
        clockFilledIds: new Set(),
      },
    );

    expect(result).toEqual({
      status: "pending",
      satisfiedCount: 1,
      totalConditions: 2,
      satisfiedKinds: ["objective_completed"],
    });
  });

  it("selects active objective by max priority with sortOrder as tie breaker", () => {
    const service = makeService();
    const low = {
      id: "low",
      status: "active",
      priority: 10,
      sortOrder: 0,
    } as QuestObjectiveEntity;
    const tieLater = {
      id: "later",
      status: "active",
      priority: 20,
      sortOrder: 2,
    } as QuestObjectiveEntity;
    const tieEarlier = {
      id: "earlier",
      status: "active",
      priority: 20,
      sortOrder: 1,
    } as QuestObjectiveEntity;

    expect(
      service.selectActiveObjective([low, tieLater, tieEarlier])?.id,
    ).toBe("earlier");
  });
});
