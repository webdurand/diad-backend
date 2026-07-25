import {
  getMonsterRechargeRange,
  monsterActionDisplayName,
  rechargeMinimum,
} from "./monster-recharge";

describe("monster recharge metadata", () => {
  it("normaliza a tag do 5etools e traduz o nome exibido", () => {
    const action = { name: "Whirlwind {@recharge 4}" };

    expect(monsterActionDisplayName(action)).toBe(
      "Whirlwind (Recarga 4–6)",
    );
    expect(getMonsterRechargeRange(action)).toBe("4-6");
  });

  it("lê a recarga estruturada do SRD", () => {
    expect(
      getMonsterRechargeRange({
        name: "Breath Weapon",
        usage: {
          type: "recharge on roll",
          dice: "1d6",
          min_value: 5,
        },
      }),
    ).toBe("5-6");
  });

  it("converte a faixa no resultado mínimo do d6", () => {
    expect(rechargeMinimum("4-6")).toBe(4);
    expect(rechargeMinimum("5-6")).toBe(5);
    expect(rechargeMinimum("6")).toBe(6);
  });
});
