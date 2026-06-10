export const TRAVEL_HOURS_MIN = 1;
export const TRAVEL_HOURS_MAX = 24;

export function parseTravelTimeToMinutes(
  travelTime: string | null | undefined,
): number | null {
  if (travelTime == null) return null;
  const trimmed = String(travelTime).trim();
  const normalized = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/^\d+$/.test(normalized)) {
    const hours = parseInt(normalized, 10);
    if (hours < TRAVEL_HOURS_MIN || hours > TRAVEL_HOURS_MAX) return null;
    return hours * 60;
  }

  const hourMatch = normalized.match(
    /^(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hora|horas|hour|hours)$/,
  );
  if (hourMatch) {
    const hours = Number(hourMatch[1].replace(",", "."));
    if (!Number.isFinite(hours)) return null;
    if (hours < TRAVEL_HOURS_MIN || hours > TRAVEL_HOURS_MAX) return null;
    return Math.round(hours * 60);
  }

  const minuteMatch = normalized.match(
    /^(\d+)\s*(?:m|min|mins|minuto|minutos|minute|minutes)$/,
  );
  if (minuteMatch) {
    const minutes = parseInt(minuteMatch[1], 10);
    if (minutes < TRAVEL_HOURS_MIN * 60 || minutes > TRAVEL_HOURS_MAX * 60) {
      return null;
    }
    return minutes;
  }

  return null;
}

export function formatTravelTimeLabel(
  travelTime: string | null | undefined,
): string | null {
  const minutes = parseTravelTimeToMinutes(travelTime);
  if (minutes == null) return null;
  return `${minutes / 60}h`;
}
