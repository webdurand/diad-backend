import {
  findGiantAncestryChoice,
  normalizeGiantAncestryChoice,
  proficiencyBonusForLevel,
} from "./goliath-rules";

describe("Goliath rules", () => {
  it.each([
    ["Cloud's Jaunt", "clouds-jaunt"],
    ["Fire’s Burn", "fires-burn"],
    ["frost giant", "frosts-chill"],
    ["Hill's Tumble", "hills-tumble"],
    ["Stone's Endurance", "stones-endurance"],
    ["Storm's Thunder", "storms-thunder"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeGiantAncestryChoice(input)).toBe(expected);
  });

  it("finds the first ancestry choice in persisted origin values", () => {
    expect(findGiantAncestryChoice(["unrelated", "Fire's Burn"])).toBe(
      "fires-burn",
    );
  });

  it.each([
    [1, 2],
    [5, 3],
    [10, 4],
    [15, 5],
    [20, 6],
  ])("uses proficiency bonus at level %i", (level, expected) => {
    expect(proficiencyBonusForLevel(level)).toBe(expected);
  });
});
