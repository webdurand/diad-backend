import { getSpellDamage } from "./spell-damage-catalog";

describe("spell damage catalog", () => {
  it("usa o dano inicial 2024 de Witch Bolt e escala somente o ataque inicial", () => {
    expect(getSpellDamage("witch-bolt", 1, 1)).toEqual({
      expression: "2d12",
      type: "lightning",
    });
    expect(getSpellDamage("witch-bolt", 3, 20)).toEqual({
      expression: "4d12",
      type: "lightning",
    });
  });

  it("modela o dano inicial das magias altas de Druida", () => {
    expect(getSpellDamage("fire-storm", 7, 20)).toEqual({
      expression: "7d10",
      type: "fire",
    });
    expect(getSpellDamage("sunburst", 8, 20)).toEqual({
      expression: "12d6",
      type: "radiant",
    });
    expect(getSpellDamage("storm-of-vengeance", 9, 20)).toEqual({
      expression: "2d6",
      type: "thunder",
    });
  });
});
