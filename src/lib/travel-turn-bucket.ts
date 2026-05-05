export const TRAVEL_INSTANT_THRESHOLD_MINUTES = 30;
export const TRAVEL_MAX_TURNS = 4;

export function computeTravelTurns(totalMinutes: number | null | undefined): number {
  if (totalMinutes == null || totalMinutes <= 0) return 0;
  if (totalMinutes < TRAVEL_INSTANT_THRESHOLD_MINUTES) return 0;
  if (totalMinutes <= 60) return 1;
  if (totalMinutes <= 4 * 60) return 2;
  if (totalMinutes <= 12 * 60) return 3;
  return TRAVEL_MAX_TURNS;
}
