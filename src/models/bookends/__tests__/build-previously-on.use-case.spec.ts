import { BuildPreviouslyOnUseCase } from "../application/build-previously-on.use-case";

describe("BuildPreviouslyOnUseCase", () => {
  it("reusa SessionRecapService.ensureRecap e rewrap em Anteriormente diegetico", async () => {
    const recapService = {
      ensureRecap: jest.fn(async () => ({
        status: "cached" as const,
        summaryText: "Maguin poupou a barqueira e perdeu a chave no rio.",
      })),
    };
    const useCase = new BuildPreviouslyOnUseCase(recapService);

    const result = await useCase.execute({ sessionId: "sess-1" });

    expect(recapService.ensureRecap).toHaveBeenCalledWith("sess-1");
    expect(result).toEqual({
      prose:
        "Anteriormente, Maguin poupou a barqueira e perdeu a chave no rio.",
      source: "cache",
    });
  });
});
