import {
  getBlightCreatureRules,
  maximumDiceExpression,
} from "./blight-rules";

describe("blight-rules", () => {
  it.each(["undead", "Construct", "undead (shapechanger)"])(
    "has no effect on %s",
    (creatureType) => {
      expect(getBlightCreatureRules({ creatureType })).toMatchObject({
        hasNoEffect: true,
        saveHasDisadvantage: false,
        dealsMaximumDamage: false,
      });
    },
  );

  it("gives plants disadvantage and maximum damage", () => {
    expect(getBlightCreatureRules({ monster: { type: "plant" } })).toEqual({
      creatureType: "plant",
      hasNoEffect: false,
      saveHasDisadvantage: true,
      dealsMaximumDamage: true,
    });
  });

  it("leaves ordinary creatures unchanged", () => {
    expect(getBlightCreatureRules({ creatureType: "dragon" })).toMatchObject({
      hasNoEffect: false,
      saveHasDisadvantage: false,
      dealsMaximumDamage: false,
    });
  });

  it("computes maximum damage for supported dice expressions", () => {
    expect(maximumDiceExpression("8d8")).toBe(64);
    expect(maximumDiceExpression("9d8 + 2")).toBe(74);
    expect(maximumDiceExpression("invalid")).toBe(0);
  });
});
