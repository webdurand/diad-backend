import { DerivePhaseOutcomeUseCase } from "../application/derive-phase-outcome.use-case";
import { createEmptyXpTriggerState } from "../domain/hidden-layer.types";

describe("DerivePhaseOutcomeUseCase", () => {
  const useCase = new DerivePhaseOutcomeUseCase();

  it("mapeia 3 triggers verdadeiros para BITTERSWEET", () => {
    expect(
      useCase.execute({
        objective_met: true,
        belief_expressed: true,
        flaw_struggled: true,
        bond_progressed: false,
        secret_revealed: false,
      }),
    ).toBe("BITTERSWEET");
  });

  it("mapeia 5 triggers verdadeiros para TRIUMPH", () => {
    expect(
      useCase.execute({
        objective_met: true,
        belief_expressed: true,
        flaw_struggled: true,
        bond_progressed: true,
        secret_revealed: true,
      }),
    ).toBe("TRIUMPH");
  });

  it("mapeia nenhum trigger verdadeiro para FAILURE", () => {
    expect(useCase.execute(createEmptyXpTriggerState())).toBe("FAILURE");
  });

  it("mapeia 2 triggers verdadeiros para COSTLY", () => {
    expect(
      useCase.execute({
        objective_met: true,
        belief_expressed: false,
        flaw_struggled: false,
        bond_progressed: true,
        secret_revealed: false,
      }),
    ).toBe("COSTLY");
  });
});
