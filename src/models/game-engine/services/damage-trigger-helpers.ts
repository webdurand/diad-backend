/**
 * Spec 016 P4 (M3) — Damage trigger helpers (pure).
 *
 * Detect Fate Ladder triggers from damage events:
 *  - massive_damage_2024: remaining damage após zerar HP ≥ hpMax (RAW 2024 PHB)
 *  - three_failed_death_saves: PC dying recebeu dano e fail count chegou a 3
 *  - instant_kill_effect: spell/effect explicit (Power Word Kill, Disintegrate at 0)
 *
 * Decisão Fate Ladder vs morte direta:
 *  - hardcore mode: nunca abre Fate Ladder; instant kill = dead permanent
 *  - narrative mode: abre Fate Ladder com trigger apropriado
 *
 * Lógica espelha character-state.service.updateHp() linhas 224-229 (massive
 * damage RAW 2024). Helper extraído pra testabilidade isolada e usar em
 * combat.service quando dispatch Fate Ladder.
 */

export type FateLadderTriggerKind =
  | "three_failed_death_saves"
  | "massive_damage_2024"
  | "instant_kill_effect";

export type DeathHandlingMode = "narrative" | "hardcore";

export interface DamageEvent {
  /** HP antes do golpe. */
  hpBefore: number;
  /** HP máximo do alvo. */
  hpMax: number;
  /** Dano remaining após temp HP absorver. */
  damageRemaining: number;
  /** Já estava em 0 HP (dying)? */
  wasDying: boolean;
  /** Death saves após o golpe (se wasDying). */
  failuresAfter?: number;
  /** Effect explícito tipo Power Word Kill. */
  isInstantKillEffect?: boolean;
}

/**
 * Detecta massive damage RAW 2024:
 * "Damage Reducing You to 0 HP. If damage reduces you to 0 HP and there's
 *  damage remaining, you die if the remaining damage equals or exceeds
 *  your HP maximum."
 */
export function isMassiveDamage2024(event: DamageEvent): boolean {
  if (event.wasDying) return false; // dying PCs já não têm hpBefore > 0 normal
  if (event.hpMax <= 0) return false;
  const reachedZero = event.hpBefore <= event.damageRemaining;
  if (!reachedZero) return false;
  const excess = event.damageRemaining - event.hpBefore;
  return excess >= event.hpMax;
}

/**
 * Detecta qual trigger Fate Ladder se aplica. Retorna null se não dispara.
 */
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

/**
 * Decide se abre Fate Ladder modal (narrative mode) ou vai direto pra
 * morte permanente (hardcore).
 *
 * RAW 2024 não tem Fate Ladder — é layer narrativa opt-in. Hardcore mode
 * preserva RAW puro.
 */
export function shouldOpenFateLadder(
  trigger: FateLadderTriggerKind | null,
  mode: DeathHandlingMode,
): boolean {
  if (trigger === null) return false;
  if (mode === "hardcore") return false;
  return true;
}
