import { getSpellHealing } from "./spell-healing-catalog";

describe("spell healing catalog", () => {
  it("usa a progressão de cura do SRD 5.2 para Cure Wounds", () => {
    expect(getSpellHealing("cure-wounds", 1)).toEqual({
      expression: "2d8 + MOD",
    });
    expect(getSpellHealing("cure-wounds", 2)).toEqual({
      expression: "4d8 + MOD",
    });
  });

  it("usa a progressão de cura do SRD 5.2 para Healing Word", () => {
    expect(getSpellHealing("healing-word", 1)).toEqual({
      expression: "2d4 + MOD",
    });
    expect(getSpellHealing("healing-word", 2)).toEqual({
      expression: "4d4 + MOD",
    });
  });

  it("usa 2d4 e progressão de 1d4 para Mass Healing Word", () => {
    expect(getSpellHealing("mass-healing-word", 3)).toEqual({
      expression: "2d4 + MOD",
    });
    expect(getSpellHealing("mass-healing-word", 4)).toEqual({
      expression: "3d4 + MOD",
    });
  });

  it("Heal recupera 70 HP no nível 6 e mais 10 por nível de slot", () => {
    expect(getSpellHealing("heal", 5)).toBeNull();
    expect(getSpellHealing("heal", 6)).toEqual({ expression: "70" });
    expect(getSpellHealing("heal", 9)).toEqual({ expression: "100" });
  });
});
