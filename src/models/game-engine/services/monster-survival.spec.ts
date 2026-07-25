import {
  hasUndeadFortitude,
  resolveUndeadFortitude,
} from "./monster-survival";

const ability = [
  {
    name: "Undead Fortitude",
    desc: "If damage reduces the zombie to 0 hit points, it makes a Constitution saving throw.",
  },
];

describe("monster survival rules", () => {
  it("recognizes Undead Fortitude in SRD special abilities", () => {
    expect(hasUndeadFortitude(ability)).toBe(true);
  });

  it("returns the zombie to 1 HP when CON reaches DC 5 + damage", () => {
    expect(
      resolveUndeadFortitude({
        specialAbilities: ability,
        constitutionScore: 16,
        damageTaken: 7,
        damageType: "slashing",
        critical: false,
        roll: 9,
      }),
    ).toEqual({
      attempted: true,
      dc: 12,
      roll: 9,
      modifier: 3,
      total: 12,
      success: true,
    });
  });

  it.each([
    { critical: true, damageType: "slashing", blockedBy: "critical" },
    { critical: false, damageType: "radiant", blockedBy: "radiant" },
  ])("does not attempt when blocked by $blockedBy", (input) => {
    expect(
      resolveUndeadFortitude({
        specialAbilities: ability,
        constitutionScore: 16,
        damageTaken: 7,
        roll: 20,
        ...input,
      }),
    ).toEqual({
      attempted: false,
      blockedBy: input.blockedBy,
    });
  });
});
