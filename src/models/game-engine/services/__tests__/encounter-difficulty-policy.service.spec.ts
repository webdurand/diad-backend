import { EncounterDifficultyPolicyService } from "../encounter-difficulty-policy.service";

describe("EncounterDifficultyPolicyService", () => {
  const service = new EncounterDifficultyPolicyService();

  it.each([
    ["heroic", "low", "low"],
    ["heroic", "moderate", "low"],
    ["heroic", "high", "moderate"],
    ["standard", "low", "low"],
    ["standard", "moderate", "moderate"],
    ["standard", "high", "high"],
    ["gritty", "low", "moderate"],
    ["gritty", "moderate", "high"],
    ["gritty", "high", "high"],
  ] as const)(
    "mapeia campanha %s e pedido %s para %s",
    (campaignDifficulty, requested, expected) => {
      expect(service.resolve(campaignDifficulty, requested)).toMatchObject({
        campaignDifficulty,
        requestedDifficulty: requested,
        effectiveDifficulty: expected,
        adjusted: requested !== expected,
      });
    },
  );

  it("trata dificuldade ausente ou desconhecida como standard", () => {
    expect(service.resolve(undefined, "moderate")).toMatchObject({
      campaignDifficulty: "standard",
      effectiveDifficulty: "moderate",
    });
    expect(service.resolve("custom", "high")).toMatchObject({
      campaignDifficulty: "standard",
      effectiveDifficulty: "high",
    });
  });
});
