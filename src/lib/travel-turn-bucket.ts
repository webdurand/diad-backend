export const TRAVEL_MAX_TURNS = 5;
export const TRAVEL_MIN_TURNS = 2;
export const TRAVEL_DEFAULT_MINUTES_FALLBACK = 30;

export function computeTravelTurns(totalMinutes: number | null | undefined): number {
  if (totalMinutes == null || totalMinutes <= 0) return TRAVEL_MIN_TURNS;
  if (totalMinutes <= 60) return 2;
  if (totalMinutes <= 4 * 60) return 3;
  if (totalMinutes <= 12 * 60) return 4;
  return TRAVEL_MAX_TURNS;
}
