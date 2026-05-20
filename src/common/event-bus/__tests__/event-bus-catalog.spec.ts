import { isEventTypeRegistered } from "../event-bus.types";

describe("Event bus catalog — spec 044", () => {
  it.each([
    "dialogue_started",
    "dialogue_exited",
    "dialogue_focal_swapped",
    "meta_query_invoked",
  ])("registers NarrativeEvent %s", (eventType) => {
    expect(isEventTypeRegistered("NarrativeEvent", eventType)).toBe(true);
  });
});
