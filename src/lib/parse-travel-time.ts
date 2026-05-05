export const TRAVEL_HOURS_MIN = 1;
export const TRAVEL_HOURS_MAX = 24;

export function parseTravelTimeToMinutes(
  travelTime: string | null | undefined,
): number | null {
  if (travelTime == null) return null;
  const trimmed = String(travelTime).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const hours = parseInt(trimmed, 10);
  if (hours < TRAVEL_HOURS_MIN || hours > TRAVEL_HOURS_MAX) return null;
  return hours * 60;
}

export function formatTravelTimeLabel(
  travelTime: string | null | undefined,
): string | null {
  const minutes = parseTravelTimeToMinutes(travelTime);
  if (minutes == null) return null;
  return `${minutes / 60}h`;
}
