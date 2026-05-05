import { parseTravelTimeToMinutes } from "../parse-travel-time";
import { computeTravelTurns } from "../travel-turn-bucket";

describe("parseTravelTimeToMinutes", () => {
  it.each([
    ["5 minutes", 5],
    ["30 min", 30],
    ["30min", 30],
    ["45 minutos", 45],
    ["2 hours", 120],
    ["2h", 120],
    ["1 hora", 60],
    ["1.5 hours", 90],
    ["half day", 12 * 60],
    ["meio dia", 12 * 60],
    ["1 day", 24 * 60],
    ["1d", 24 * 60],
    ["2 dias", 48 * 60],
    ["4-6 hours", 240],
    ["4 to 6 hours", 240],
    ["3 a 5 horas", 180],
    ["  2 HOURS  ", 120],
  ])("parses %p → %d minutes", (input, expected) => {
    expect(parseTravelTimeToMinutes(input)).toBe(expected);
  });

  it.each([
    [null, null],
    [undefined, null],
    ["", null],
    ["unknown format", null],
    ["very fast", null],
  ])("returns null for unparseable %p", (input, expected) => {
    expect(parseTravelTimeToMinutes(input)).toBe(expected);
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
    [60, 1],
    [61, 2],
    [240, 2],
    [241, 3],
    [12 * 60, 3],
    [12 * 60 + 1, 4],
    [24 * 60, 4],
    [48 * 60, 4],
  ])("computes %p minutes → %d turns (always >= 1, no instant)", (input, expected) => {
    expect(computeTravelTurns(input)).toBe(expected);
  });
});
