import { Injectable } from '@nestjs/common';

export type ExhaustionVariant = '2014_six_levels' | '2024_ten_levels';

export interface ExhaustionModifiers {
  /** Desvantagem em ability checks. */
  disadvAbility: boolean;
  /** Multiplicador de velocidade (1.0 = sem alteração; 0.5 = metade; 0 = parado). */
  speedMultiplier: number;
  /** Spec 004 CP9 — XPHB 2024: redução flat de speed em ft (-5×level). Null no 2014. */
  speedPenaltyFt?: number;
  /** Desvantagem em ataques. */
  disadvAttack: boolean;
  /** Desvantagem em saving throws. */
  disadvSave: boolean;
  /** Multiplicador de HP máximo (1.0 = sem alteração; 0.5 = metade). */
  maxHpMultiplier: number;
  /** True se o nível atingido implica morte instantânea. */
  dead: boolean;
  /** Spec 004 CP9 — XPHB 2024: penalidade flat em TODOS d20 rolls (-2×level). Null no 2014. */
  d20Penalty?: number;
}

/**
 * Spec 004 — Exhaustion.
 *
 * **2014** (PHB Apêndice A, 6 níveis cumulativos):
 *  1: desvantagem em ability checks.
 *  2: speed × 0.5.
 *  3: desvantagem em ataques e saves.
 *  4: maxHP × 0.5.
 *  5: speed = 0.
 *  6: morte.
 *
 * **2024** (XPHB p.365, 10 níveis cumulativos — muito mais limpo):
 *  - -2 × level em TODOS d20 rolls (attacks/checks/saves/death saves).
 *  - -5 × level ft em speed.
 *  - Level 10 = morte.
 *
 * Variant selection via `EditionRules.exhaustionVariant` no comp_source do PC.
 */
@Injectable()
export class ExhaustionService {
  getModifiers(
    level: number,
    variant: ExhaustionVariant = '2014_six_levels',
  ): ExhaustionModifiers {
    if (variant === '2024_ten_levels') {
      const lvl = Math.max(0, Math.min(10, Math.floor(level)));
      // Usa `|| 0` pra normalizar -0 (JS quirk) em 0.
      const d20Penalty = (-2 * lvl) || 0;
      const speedPenaltyFt = (-5 * lvl) || 0;
      return {
        // Em 2024 não ha "disadvantage" por exhaustion — e penalidade flat.
        disadvAbility: false,
        disadvAttack: false,
        disadvSave: false,
        // speedMultiplier=1 por que a redução é flat (em ft), não proporcional.
        speedMultiplier: 1,
        speedPenaltyFt,
        maxHpMultiplier: 1,
        dead: lvl >= 10,
        d20Penalty,
      };
    }
    const lvl = Math.max(0, Math.min(6, Math.floor(level)));
    return {
      disadvAbility: lvl >= 1,
      speedMultiplier: lvl >= 5 ? 0 : lvl >= 2 ? 0.5 : 1,
      disadvAttack: lvl >= 3,
      disadvSave: lvl >= 3,
      maxHpMultiplier: lvl >= 4 ? 0.5 : 1,
      dead: lvl >= 6,
    };
  }

  /** Extrai o nível de exhaustion das ConditionInstance[] de um participante. */
  getLevelFromInstances(
    instances: { slug: string; level?: number }[] | undefined,
  ): number {
    if (!instances || instances.length === 0) return 0;
    const exh = instances.find((i) => i.slug === 'exhaustion');
    return exh?.level ?? 0;
  }
}
