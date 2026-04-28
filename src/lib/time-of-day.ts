/**
 * Spec 019 — pure function que deriva TimeOfDay de
 * `currentInGameDateTime` + `sunriseTime` + `sunsetTime`.
 *
 * Não persistido — recalculado a cada read. Permite mudar sunrise/sunset
 * (estações, planos) sem tocar rows existentes.
 *
 *   dawn      = sunrise - 30min .. sunrise + 30min
 *   morning   = sunrise + 30min .. 12:00
 *   afternoon = 12:00 .. sunset - 30min
 *   dusk      = sunset - 30min .. sunset + 30min
 *   night     = sunset + 30min .. 23:59
 *   midnight  = 00:00 .. sunrise - 30min
 */

export type TimeOfDay =
  | "dawn"
  | "morning"
  | "afternoon"
  | "dusk"
  | "night"
  | "midnight";

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseHhmmToMinutes(hhmm: string): number {
  if (!HHMM_REGEX.test(hhmm)) {
    throw new Error(
      `Invalid HH:mm format: ${hhmm}. Expected '00:00'..'23:59'.`,
    );
  }
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesOfDay(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function computeTimeOfDay(
  now: Date,
  sunriseHhmm: string,
  sunsetHhmm: string,
): TimeOfDay {
  const nowMin = minutesOfDay(now);
  const sunrise = parseHhmmToMinutes(sunriseHhmm);
  const sunset = parseHhmmToMinutes(sunsetHhmm);
  const dawnStart = sunrise - 30;
  const dawnEnd = sunrise + 30;
  const duskStart = sunset - 30;
  const duskEnd = sunset + 30;

  if (nowMin >= dawnStart && nowMin < dawnEnd) return "dawn";
  if (nowMin >= dawnEnd && nowMin < 12 * 60) return "morning";
  if (nowMin >= 12 * 60 && nowMin < duskStart) return "afternoon";
  if (nowMin >= duskStart && nowMin < duskEnd) return "dusk";
  if (nowMin >= duskEnd) return "night";
  // 00:00 .. dawnStart
  return "midnight";
}
