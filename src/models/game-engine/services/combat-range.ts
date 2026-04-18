/**
 * Spec 012 #1 — range enforcement pra resolveAttack.
 *
 * Funções puras (sem DI, sem IO). Recebem o range string já populado pelo
 * actions.service / monsterActionResolver (`"5 ft"`, `"150/600 ft"`, `"Self"`,
 * `"Touch"`) + posições de grid, retornam ok/disadvantage/out-of-range.
 *
 * RAW D&D 5e: cada cell do grid = 5ft, Chebyshev distance (diagonais contam
 * como 1 cell, NÃO como 1.5). Armas ranged entre normal e long = disadvantage.
 */

export interface Position {
  x: number;
  y: number;
}

export interface ParsedRange {
  /** Distância normal em pés. Para melee weapons é o reach (5ft default, 10ft reach). */
  normal: number;
  /** Long range em pés (só ranged weapons/spells com categoria `150/600`). */
  long?: number;
}

export interface RangeCheckResult {
  ok: boolean;
  /** True quando falta grid info (position null em um dos lados) — check é pulado. */
  skipped?: boolean;
  /** True se o alvo está entre normal e long (ranged com disadvantage). */
  disadvantage: boolean;
  distanceFt: number;
  /** Alcance máximo da ação (long se existir, senão normal). */
  maxFt: number;
}

export function parseRangeString(raw: string | null | undefined): ParsedRange | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === '') return null;
  if (s === 'self') return { normal: 0 };
  if (s === 'touch') return { normal: 5 };
  if (s.includes('/')) {
    const [nStr, lStr] = s.split('/');
    const normal = parseInt(nStr.replace(/[^0-9]/g, ''), 10);
    const long = parseInt(lStr.replace(/[^0-9]/g, ''), 10);
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
    return { ok: true, skipped: true, disadvantage: false, distanceFt: 0, maxFt: 0 };
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
