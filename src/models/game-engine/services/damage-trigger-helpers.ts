

export type FateLadderTriggerKind =
  | "three_failed_death_saves"
  | "massive_damage_2024"
  | "instant_kill_effect";

export type DeathHandlingMode = "narrative" | "hardcore";

export interface DamageEvent {

  hpBefore: number;

  hpMax: number;

  damageRemaining: number;

  wasDying: boolean;

  failuresAfter?: number;

  isInstantKillEffect?: boolean;
}


export function isMassiveDamage2024(event: DamageEvent): boolean {
  if (event.wasDying) return false;
  if (event.hpMax <= 0) return false;
  const reachedZero = event.hpBefore <= event.damageRemaining;
  if (!reachedZero) return false;
  const excess = event.damageRemaining - event.hpBefore;
  return excess >= event.hpMax;
}


export function detectFateLadderTrigger(
  event: DamageEvent,
): FateLadderTriggerKind | null {
  if (event.isInstantKillEffect) return "instant_kill_effect";
  if (isMassiveDamage2024(event)) return "massive_damage_2024";
  if (event.wasDying && (event.failuresAfter ?? 0) >= 3) {
    return "three_failed_death_saves";
  }
  return null;
}


export function shouldOpenFateLadder(
  trigger: FateLadderTriggerKind | null,
  mode: DeathHandlingMode,
): boolean {
  if (trigger === null) return false;
  if (mode === "hardcore") return false;
  return true;
}
