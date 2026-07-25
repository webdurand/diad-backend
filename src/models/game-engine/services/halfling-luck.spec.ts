import {
  hasHalflingLuck,
  rollD20TestWithHalflingLuck,
} from "./halfling-luck";

describe("Halfling Luck", () => {
  it("recognizes the canonical XPHB Luck feature", () => {
    expect(
      hasHalflingLuck({
        race: { slug: "halfling" },
        features: [{ slug: "luck", active: true }],
      }),
    ).toBe(true);
  });

  it("rerolls a natural 1 and must use the new result", () => {
    const rolls = [1, 11];
    const result = rollD20TestWithHalflingLuck({
      enabled: true,
      roll: () => rolls.shift()!,
    });

    expect(result.chosen).toBe(11);
    expect(result.rerolls).toEqual([
      { die: "normal", original: 1, rerolled: 11 },
    ]);
  });

  it("rerolls each natural 1 before resolving disadvantage", () => {
    const rolls = [1, 14, 7];
    const result = rollD20TestWithHalflingLuck({
      enabled: true,
      disadvantage: true,
      roll: () => rolls.shift()!,
    });

    expect(result.advantage).toEqual({
      roll1: 14,
      roll2: 7,
      chosen: 7,
      discarded: 14,
    });
  });
});
