import { parseActionRangeFeet } from "./actions.service";

describe("parseActionRangeFeet", () => {
  it.each([
    ["150 feet", 150],
    ["60 ft", 60],
    ["1 mile", 5280],
    ["2 miles", 10560],
    ["Self", 0],
  ])("maps %s to %i feet", (range, expected) => {
    expect(parseActionRangeFeet(range)).toBe(expected);
  });
});
