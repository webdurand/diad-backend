const ROUNDS_PER_UNIT: Record<string, number> = {
  round: 1,
  rounds: 1,
  minute: 10,
  minutes: 10,
  hour: 600,
  hours: 600,
  day: 14_400,
  days: 14_400,
};

/**
 * Converts a spell's persisted duration label to combat rounds.
 *
 * Indefinite and instantaneous durations deliberately return null so the
 * concentration lifecycle does not invent an expiry that the spell does not
 * define.
 */
export function spellDurationRounds(duration: string | null | undefined) {
  const normalized = (duration ?? "")
    .trim()
    .toLowerCase()
    .replace(/^concentration,\s*/, "")
    .replace(/^up to\s+/, "");

  if (
    !normalized ||
    normalized === "instantaneous" ||
    normalized.includes("until dispelled") ||
    normalized.includes("until triggered") ||
    normalized === "special"
  ) {
    return null;
  }

  const match = normalized.match(
    /^(\d+(?:\.\d+)?)\s+(rounds?|minutes?|hours?|days?)\b/,
  );
  if (!match) return null;

  const amount = Number(match[1]);
  const multiplier = ROUNDS_PER_UNIT[match[2]];
  if (!Number.isFinite(amount) || amount <= 0 || multiplier == null) {
    return null;
  }

  return Math.ceil(amount * multiplier);
}

export function concentrationDurationRounds(
  duration: string | null | undefined,
  extended = false,
) {
  const base = spellDurationRounds(duration);
  if (base == null || !extended) return base;
  return Math.min(base * 2, 14_400);
}
