import type { SaveAbility } from "../interfaces/combat.interfaces";

export interface StormOfVengeancePhase {
  round: number;
  damageExpression: string;
  damageType: "acid" | "lightning" | "bludgeoning" | "cold";
  saveAbility?: SaveAbility;
  halfOnSave?: boolean;
  maxTargets?: number;
}

/**
 * The cast itself resolves round 1 (thunder + deafened). Subsequent caster
 * turns use this table while concentration remains active.
 */
export function getStormOfVengeancePhase(
  createdRound: number,
  currentRound: number,
): StormOfVengeancePhase | null {
  const round = currentRound - createdRound + 1;

  if (round === 2) {
    return { round, damageExpression: "1d6", damageType: "acid" };
  }
  if (round === 3) {
    return {
      round,
      damageExpression: "10d6",
      damageType: "lightning",
      saveAbility: "dex",
      halfOnSave: true,
      maxTargets: 6,
    };
  }
  if (round === 4) {
    return {
      round,
      damageExpression: "2d6",
      damageType: "bludgeoning",
    };
  }
  if (round >= 5 && round <= 10) {
    return { round, damageExpression: "1d6", damageType: "cold" };
  }

  return null;
}
