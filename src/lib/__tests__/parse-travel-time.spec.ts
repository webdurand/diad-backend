import {
  parseTravelTimeToMinutes,
  formatTravelTimeLabel,
} from "../parse-travel-time";
import { computeTravelTurns } from "../travel-turn-bucket";

describe("parseTravelTimeToMinutes (integer 1-24, hours)", () => {
  it.each([
    ["1", 60],
    ["2", 120],
    ["4", 240],
    ["12", 720],
    ["24", 1440],
    ["  4  ", 240],
    ["4h", 240],
    ["4 hours", 240],
    ["2 horas", 120],
    ["90 minutes", 90],
  ])("parses %p → %d minutes", (input, expected) => {
    expect(parseTravelTimeToMinutes(input)).toBe(expected);
  });

  it.each([
    [null, null],
    [undefined, null],
    ["", null],
    ["0", null],
    ["25", null],
    ["abc", null],
    ["half day", null],
  ])("returns null for invalid %p", (input, expected) => {
    expect(parseTravelTimeToMinutes(input)).toBe(expected);
  });
});

describe("formatTravelTimeLabel", () => {
  it.each([
    ["1", "1h"],
    ["4", "4h"],
    ["12", "12h"],
    ["abc", null],
    [null, null],
  ])("formats %p → %p", (input, expected) => {
    expect(formatTravelTimeLabel(input)).toBe(expected);
  });
});

describe("computeTravelTurns", () => {
  it.each([
    [null, 1],
    [undefined, 1],
    [0, 1],
    [-10, 1],
    [5, 1],
    [29, 1],
    [30, 1],
    [31, 2],
    [60, 2],
    [61, 3],
    [120, 4],
    [180, 6],
    [240, 8],
    [241, 8],
    [12 * 60, 8],
    [24 * 60, 8],
  ])(
    "computes %p minutes → %d turns (~30min/turn, cap 1-8)",
    (input, expected) => {
      expect(computeTravelTurns(input)).toBe(expected);
    },
  );
});
