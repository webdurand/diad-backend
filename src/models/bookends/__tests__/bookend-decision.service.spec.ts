import { BookendDecisionService } from "../services/bookend-decision.service";

describe("BookendDecisionService", () => {
  const service = new BookendDecisionService();

  it("retorna true quando gapMinutes >= 30", () => {
    expect(
      service.shouldShowPreviously({
        gapMinutes: 30,
        sceneNumber: 2,
        crossDay: false,
        phaseChangedSinceLastSession: false,
        previouslySeen: false,
      }),
    ).toBe(true);
  });

  it("retorna false para sceneNumber=1 mesmo com gap", () => {
    expect(
      service.shouldShowPreviously({
        gapMinutes: 90,
        sceneNumber: 1,
        crossDay: true,
        phaseChangedSinceLastSession: true,
        previouslySeen: false,
      }),
    ).toBe(false);
  });

  it("retorna false quando previously_on ja foi visto na sessao", () => {
    expect(
      service.shouldShowPreviously({
        gapMinutes: 45,
        sceneNumber: 3,
        crossDay: false,
        phaseChangedSinceLastSession: false,
        previouslySeen: true,
      }),
    ).toBe(false);
  });
});
