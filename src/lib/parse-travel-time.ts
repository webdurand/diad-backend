export function parseTravelTimeToMinutes(
  travelTime: string | null | undefined,
): number | null {
  if (!travelTime) return null;
  const normalized = travelTime.toLowerCase().trim();
  if (!normalized) return null;

  const rangeMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:-|to|–|—|a|até)\s*(\d+(?:\.\d+)?)\s*(.+)$/);
  if (rangeMatch) {
    return parseTravelTimeToMinutes(`${rangeMatch[1]} ${rangeMatch[3]}`);
  }

  if (normalized === "half day" || normalized === "meio dia") return 12 * 60;
  if (normalized === "full day" || normalized === "1 day" || normalized === "one day" || normalized === "um dia") {
    return 24 * 60;
  }

  const minutesMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|minutos?)$/);
  if (minutesMatch) return Math.round(parseFloat(minutesMatch[1]));

  const hoursMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|horas?|hora)$/);
  if (hoursMatch) return Math.round(parseFloat(hoursMatch[1]) * 60);

  const daysMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:days?|d|dias?|dia)$/);
  if (daysMatch) return Math.round(parseFloat(daysMatch[1]) * 24 * 60);

  return null;
}
