import {
  concentrationDurationRounds,
  huntersMarkDurationRounds,
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

  it.each([
    [1, 600],
    [2, 600],
    [3, 4_800],
    [4, 4_800],
    [5, 14_400],
    [9, 14_400],
  ])(
    "aplica a duração PHB de Hunter's Mark com slot %i",
    (slotLevel, expected) => {
      expect(huntersMarkDurationRounds(slotLevel)).toBe(expected);
    },
  );

  it("estende Hunter's Mark sem ultrapassar 24 horas", () => {
    expect(huntersMarkDurationRounds(1, true)).toBe(1_200);
    expect(huntersMarkDurationRounds(3, true)).toBe(9_600);
    expect(huntersMarkDurationRounds(5, true)).toBe(14_400);
  });
});
