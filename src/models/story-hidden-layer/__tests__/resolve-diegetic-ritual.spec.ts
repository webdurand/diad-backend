import { ResolveDiegeticRitualUseCase } from "../application/resolve-diegetic-ritual.use-case";

describe("ResolveDiegeticRitualUseCase", () => {
  const useCase = new ResolveDiegeticRitualUseCase();

  it("resolve TRIUMPH + rise para festival", () => {
    expect(
      useCase.execute({ outcomeTier: "TRIUMPH", emotionalArc: "rise" }),
    ).toBe("festival");
  });

  it("resolve FAILURE + fall para funeral", () => {
    expect(
      useCase.execute({ outcomeTier: "FAILURE", emotionalArc: "fall" }),
    ).toBe("funeral");
  });

  it("prefere hint compatível antes do fallback determinístico", () => {
    expect(
      useCase.execute({
        outcomeTier: "BITTERSWEET",
        emotionalArc: "return",
        preferredHint: "vigil",
      }),
    ).toBe("vigil");
  });
});
