import {
  chromaticOrbDamageExpression,
  chromaticOrbRollCanLeap,
  isChromaticOrbDamageType,
} from "./chromatic-orb";

describe("Chromatic Orb 2024", () => {
  it("aceita apenas os seis tipos de dano da magia", () => {
    for (const type of [
      "acid",
      "cold",
      "fire",
      "lightning",
      "poison",
      "thunder",
    ]) {
      expect(isChromaticOrbDamageType(type)).toBe(true);
    }
    expect(isChromaticOrbDamageType("force")).toBe(false);
    expect(isChromaticOrbDamageType(undefined)).toBe(false);
  });

  it("escala um d8 por nível de slot acima do primeiro", () => {
    expect(chromaticOrbDamageExpression(1)).toBe("3d8");
    expect(chromaticOrbDamageExpression(5)).toBe("7d8");
  });

  it("só permite salto quando ao menos dois d8 repetem resultado", () => {
    expect(chromaticOrbRollCanLeap([1, 4, 7])).toBe(false);
    expect(chromaticOrbRollCanLeap([1, 4, 4])).toBe(true);
  });
});
