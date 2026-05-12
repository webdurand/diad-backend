export const TRAVEL_MAX_TURNS = 8;
export const TRAVEL_MIN_TURNS = 1;
export const TRAVEL_MINUTES_PER_TURN = 30;
export const TRAVEL_DEFAULT_MINUTES_FALLBACK = 30;

export function computeTravelTurns(
  totalMinutes: number | null | undefined,
): number {
  if (totalMinutes == null || totalMinutes <= 0) return TRAVEL_MIN_TURNS;
  const turns = Math.ceil(totalMinutes / TRAVEL_MINUTES_PER_TURN);
  return Math.min(TRAVEL_MAX_TURNS, Math.max(TRAVEL_MIN_TURNS, turns));
}
