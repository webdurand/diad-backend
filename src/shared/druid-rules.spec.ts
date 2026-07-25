import {
  isElementalFuryFeatureSlug,
  normalizeElementalFuryChoice,
} from "./druid-rules";

describe("druid rules", () => {
  it.each([
    ["primal-strike", "primal-strike"],
    ["primal_strike", "primal-strike"],
    [{ option: "potent-spellcasting" }, "potent-spellcasting"],
    [{ choice: "primal-strike-druid-7" }, "primal-strike"],
  ])("normaliza a escolha de Fúria Elemental", (input, expected) => {
    expect(normalizeElementalFuryChoice(input)).toBe(expected);
  });

  it("rejeita opções fora das duas escolhas oficiais", () => {
    expect(normalizeElementalFuryChoice({ option: "ambas" })).toBeNull();
    expect(normalizeElementalFuryChoice(undefined)).toBeNull();
  });

  it("reconhece o slug qualificado apenas da opção escolhida", () => {
    expect(
      isElementalFuryFeatureSlug(
        "primal-strike-druid-7",
        "primal-strike",
      ),
    ).toBe(true);
    expect(
      isElementalFuryFeatureSlug(
        "potent-spellcasting-druid-7",
        "primal-strike",
      ),
    ).toBe(false);
  });
});
