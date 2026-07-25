import { getCharacterDamageResistances } from "./character-damage-resistance";

describe("getCharacterDamageResistances", () => {
  it("exposes the damage type chosen by a Dragonborn ancestry", () => {
    expect(
      getCharacterDamageResistances({
        originDetails: {
          draconicAncestry: { dragon: "Red", damageType: "Fire" },
        },
      }),
    ).toEqual(["Fire"]);
  });

  it("does not invent a resistance when ancestry data is absent", () => {
    expect(getCharacterDamageResistances({ originDetails: {} })).toEqual([]);
  });
});
