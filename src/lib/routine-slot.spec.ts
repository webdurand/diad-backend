import { mapTimeOfDayToRoutineSlot } from "./routine-slot";
import type { TimeOfDay } from "./time-of-day";

describe("mapTimeOfDayToRoutineSlot", () => {
  it.each([
    ["dawn", "morning"],
    ["morning", "morning"],
    ["afternoon", "afternoon"],
    ["dusk", "evening"],
    ["night", "evening"],
    ["midnight", "night"],
  ] satisfies Array<[TimeOfDay, string]>)(
    "mapeia %s para slot narrativo %s",
    (timeOfDay, expected) => {
      expect(mapTimeOfDayToRoutineSlot(timeOfDay)).toBe(expected);
    },
  );
});
