import {
  concentrationDurationRounds,
  spellDurationRounds,
} from "./spell-duration";

describe("spell duration", () => {
  it.each([
    ["1 round", 1],
    ["Up to 1 minute", 10],
    ["Concentration, up to 10 minutes", 100],
    ["1 hour", 600],
    ["8 hours", 4_800],
    ["1 day", 14_400],
  ])("converts %s to %i combat rounds", (duration, expected) => {
    expect(spellDurationRounds(duration)).toBe(expected);
  });

  it.each(["Instantaneous", "Until dispelled", "Special", "", undefined])(
    "keeps indefinite duration %s without a round counter",
    (duration) => {
      expect(spellDurationRounds(duration)).toBeNull();
    },
  );

  it("doubles Extended Spell duration and caps it at 24 hours", () => {
    expect(concentrationDurationRounds("Up to 1 minute", true)).toBe(20);
    expect(concentrationDurationRounds("Up to 1 day", true)).toBe(14_400);
  });
});
