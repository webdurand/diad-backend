import { Injectable } from '@nestjs/common';

export type ExhaustionVariant = '2014_six_levels' | '2024_ten_levels';

export interface ExhaustionModifiers {
  /** Desvantagem em ability checks. */
  disadvAbility: boolean;
  /** Multiplicador de velocidade (1.0 = sem alteração; 0.5 = metade; 0 = parado). */
  speedMultiplier: number;
  /** Desvantagem em ataques. */
  disadvAttack: boolean;
  /** Desvantagem em saving throws. */
  disadvSave: boolean;
  /** Multiplicador de HP máximo (1.0 = sem alteração; 0.5 = metade). */
  maxHpMultiplier: number;
  /** True se o nível atingido implica morte instantânea. */
  dead: boolean;
}

/**
 * Spec 004 — Exhaustion 2014 (PHB Apêndice A).
 *
 * Níveis cumulativos:
 * 1: desvantagem em ability checks.
 * 2: speed × 0.5.
 * 3: desvantagem em ataques e saves.
 * 4: maxHP × 0.5.
 * 5: speed = 0.
 * 6: morte.
 *
 * 2024 (10 níveis com -2 cumulativo) NÃO está implementado nesta release;
 * a estrutura comporta extensão futura via `EditionRules.exhaustionVariant`.
 */
@Injectable()
export class ExhaustionService {
  getModifiers(
    level: number,
    variant: ExhaustionVariant = '2014_six_levels',
  ): ExhaustionModifiers {
    if (variant === '2024_ten_levels') {
      throw new Error(
        'Exhaustion 2024 nao implementado nesta release; ative 2014_six_levels.',
      );
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
