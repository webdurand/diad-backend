import { getMonsterSavingThrowBonus } from "./monster-saving-throw";

describe("getMonsterSavingThrowBonus", () => {
  it("uses the explicit SRD saving throw value", () => {
    expect(
      getMonsterSavingThrowBonus(
        {
          wisdom: 12,
          proficiency_bonus: 5,
          proficiencies: [
            {
              value: 6,
              proficiency: {
                index: "saving-throw-wis",
                name: "Saving Throw: WIS",
              },
            },
          ],
        },
        "wis",
      ),
    ).toBe(6);
  });

  it("falls back to the raw ability modifier when not proficient", () => {
    expect(
      getMonsterSavingThrowBonus(
        { dexterity: 8, proficiencies: [] },
        "dex",
      ),
    ).toBe(-1);
  });
});
