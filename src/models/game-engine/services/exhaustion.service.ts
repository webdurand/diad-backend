import { Injectable } from "@nestjs/common";

export type ExhaustionVariant =
  | "2014_six_levels"
  | "2024_six_levels"
  | "2024_ten_levels";

export interface ExhaustionModifiers {

  disadvAbility: boolean;

  speedMultiplier: number;

  speedPenaltyFt?: number;

  disadvAttack: boolean;

  disadvSave: boolean;

  maxHpMultiplier: number;

  dead: boolean;

  d20Penalty?: number;
}


@Injectable()
export class ExhaustionService {
  getModifiers(
    level: number,
    variant: ExhaustionVariant = "2014_six_levels",
  ): ExhaustionModifiers {
    if (variant === "2024_six_levels" || variant === "2024_ten_levels") {
      const lvl = Math.max(0, Math.min(6, Math.floor(level)));

      const d20Penalty = -2 * lvl || 0;
      const speedPenaltyFt = -5 * lvl || 0;
      return {

        disadvAbility: false,
        disadvAttack: false,
        disadvSave: false,

        speedMultiplier: 1,
        speedPenaltyFt,
        maxHpMultiplier: 1,
        dead: lvl >= 6,
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


  getLevelFromInstances(
    instances: { slug: string; level?: number }[] | undefined,
  ): number {
    if (!instances || instances.length === 0) return 0;
    const exh = instances.find((i) => i.slug === "exhaustion");
    return exh?.level ?? 0;
  }
}
