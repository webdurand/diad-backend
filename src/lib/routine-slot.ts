import { TimeOfDay } from "./time-of-day";

export type RoutineSlot = "morning" | "afternoon" | "evening" | "night";

export type NpcRoutineSlots = Partial<Record<RoutineSlot, string>>;

const ROUTINE_SLOTS = new Set<RoutineSlot>([
  "morning",
  "afternoon",
  "evening",
  "night",
]);

export function mapTimeOfDayToRoutineSlot(timeOfDay: TimeOfDay): RoutineSlot {
  switch (timeOfDay) {
    case "dawn":
    case "morning":
      return "morning";
    case "afternoon":
      return "afternoon";
    case "dusk":
    case "night":
      return "evening";
    case "midnight":
      return "night";
  }
}

export function isRoutineSlot(value: unknown): value is RoutineSlot {
  return typeof value === "string" && ROUTINE_SLOTS.has(value as RoutineSlot);
}
