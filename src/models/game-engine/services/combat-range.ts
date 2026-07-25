

export interface Position {
  x: number;
  y: number;
}

export interface ParsedRange {

  normal: number;

  long?: number;
}

export interface RangeCheckResult {
  ok: boolean;

  skipped?: boolean;

  disadvantage: boolean;
  distanceFt: number;

  maxFt: number;
}

export function parseRangeString(
  raw: string | null | undefined,
): ParsedRange | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "") return null;
  if (s === "self") return { normal: 0 };
  if (s === "touch") return { normal: 5 };
  if (/\bmiles?\b/.test(s)) {
    const miles = Number.parseFloat(s.replace(",", "."));
    if (Number.isNaN(miles)) return null;
    return { normal: miles * 5_280 };
  }
  if (s.includes("/")) {
    const [nStr, lStr] = s.split("/");
    const normal = parseInt(nStr.replace(/[^0-9]/g, ""), 10);
    const long = parseInt(lStr.replace(/[^0-9]/g, ""), 10);
    if (Number.isNaN(normal)) return null;
    return Number.isNaN(long) ? { normal } : { normal, long };
  }
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const normal = parseInt(m[1], 10);
  if (Number.isNaN(normal)) return null;
  return { normal };
}

export function chebyshevDistanceFt(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 5;
}

export function checkAttackRange(
  attacker: Position | null,
  target: Position | null,
  range: ParsedRange | null,
): RangeCheckResult {
  if (!attacker || !target) {
    return {
      ok: true,
      skipped: true,
      disadvantage: false,
      distanceFt: 0,
      maxFt: 0,
    };
  }
  const effective: ParsedRange = range ?? { normal: 5 };
  const distanceFt = chebyshevDistanceFt(attacker, target);
  const maxFt = effective.long ?? effective.normal;
  if (distanceFt <= effective.normal) {
    return { ok: true, disadvantage: false, distanceFt, maxFt };
  }
  if (effective.long && distanceFt <= effective.long) {
    return { ok: true, disadvantage: true, distanceFt, maxFt };
  }
  return { ok: false, disadvantage: false, distanceFt, maxFt };
}
