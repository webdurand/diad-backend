/**
 * Spec 016 P5 (M4) — Rest helpers (pure).
 *
 * RAW 2024 short/long rest mechanics. Pure: state in → delta out.
 * Caller persiste no DB.
 *
 * RAW 2024 KEY DIFFS vs 2014:
 *  - Short rest: HD spend ainda válido, MAS PC precisa ter HP ≥ 1 (PHB 2024
 *    p.103). PC dying não pode short-rest (anti-exploit).
 *  - Long rest: 100% HP + 100% HD recovery (em 2014 era half HD). 24h gate
 *    entre long rests RAW.
 *  - Exhaustion: removida 1 nível por long rest (tanto 2014 quanto 2024).
 *
 * Camp events: Director seleciona max 1 por long rest (M4+ via
 * RestEventTemplateEntity weighted roll).
 */

export type HitDieType = "d6" | "d8" | "d10" | "d12";

export type ExhaustionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CharacterRestSnapshot {
  hp: number;
  hpMax: number;
  /** HD disponíveis pra spend, por die size. Ex: { d8: 3, d10: 2 }. */
  hitDiceAvailable: Partial<Record<HitDieType, number>>;
  /** HD máximos (= level por classe). */
  hitDiceMax: Partial<Record<HitDieType, number>>;
  exhaustionLevel: ExhaustionLevel;
  /** CON modifier para HD heal calc. */
  conModifier: number;
  /** Spell slots atuais por nível. Ex: { 1: 2, 2: 1 }. */
  spellSlotsCurrent: Record<string, number>;
  /** Spell slots máximos por nível. */
  spellSlotsMax: Record<string, number>;
  /** Features SR-restored (ex: Channel Divinity, Action Surge). */
  shortRestFeatures: string[];
  /** Features LR-restored (ex: Wild Shape pool, slots). */
  longRestFeatures: string[];
}

export interface ShortRestDelta {
  hpDelta: number;
  hdSpent: Partial<Record<HitDieType, number>>;
  hpRolls: Array<{ die: HitDieType; rolled: number; effective: number }>;
  featuresRestored: string[];
  errors: string[];
}

export interface LongRestDelta {
  hpDelta: number;
  /** HD restaurados (RAW 2024: 100%). */
  hdRestored: Partial<Record<HitDieType, number>>;
  slotsDelta: Record<string, number>;
  exhaustionFrom: ExhaustionLevel;
  exhaustionTo: ExhaustionLevel;
  featuresRestored: string[];
  errors: string[];
}

/**
 * Validation: pode short-rest?
 *   - HP must be >= 1 (RAW 2024)
 *   - encontrou local seguro (caller responsability)
 */
export function validateShortRestEligibility(
  snapshot: Pick<CharacterRestSnapshot, "hp">,
): { ok: boolean; reason?: string } {
  if (snapshot.hp < 1) {
    return {
      ok: false,
      reason:
        "Personagem inconsciente não pode descansar curto (RAW 2024 PHB p.103).",
    };
  }
  return { ok: true };
}

const HD_SIZES: Record<HitDieType, number> = {
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
};

/**
 * Computa heal de short rest gastando os HD escolhidos. RNG injetável.
 *
 * Cada HD: roll d{N} + CON modifier (clamped a 1 mínimo). Cap no hpMax.
 * Não permite spend mais HD do que disponível.
 */
export function computeShortRestDelta(
  snapshot: CharacterRestSnapshot,
  hdToSpend: Partial<Record<HitDieType, number>>,
  rng: () => number = Math.random,
): ShortRestDelta {
  const errors: string[] = [];
  const eligibility = validateShortRestEligibility(snapshot);
  if (!eligibility.ok) {
    return {
      hpDelta: 0,
      hdSpent: {},
      hpRolls: [],
      featuresRestored: [],
      errors: [eligibility.reason ?? "short_rest_blocked"],
    };
  }

  const actuallySpent: Partial<Record<HitDieType, number>> = {};
  const hpRolls: ShortRestDelta["hpRolls"] = [];
  let totalHeal = 0;

  for (const [dieKey, requested] of Object.entries(hdToSpend) as Array<
    [HitDieType, number]
  >) {
    const available = snapshot.hitDiceAvailable[dieKey] ?? 0;
    const toSpend = Math.min(requested, available);
    if (toSpend < requested) {
      errors.push(
        `Pediu ${requested} ${dieKey} mas só ${available} disponíveis.`,
      );
    }
    if (toSpend === 0) continue;
    actuallySpent[dieKey] = toSpend;
    for (let i = 0; i < toSpend; i++) {
      const sides = HD_SIZES[dieKey];
      const rolled = Math.floor(rng() * sides) + 1;
      const effective = Math.max(1, rolled + snapshot.conModifier);
      hpRolls.push({ die: dieKey, rolled, effective });
      totalHeal += effective;
    }
  }

  // Cap heal at hpMax.
  const hpRoom = snapshot.hpMax - snapshot.hp;
  const hpDelta = Math.min(totalHeal, hpRoom);

  return {
    hpDelta,
    hdSpent: actuallySpent,
    hpRolls,
    featuresRestored: [...snapshot.shortRestFeatures],
    errors,
  };
}

/**
 * RAW 2024 long rest:
 *  - HP → hpMax (full)
 *  - HD → hitDiceMax (full restore — diff vs 2014 que era half)
 *  - Spell slots → max
 *  - Exhaustion -1
 *  - Features LR-restored
 *
 * 24h gate validation é responsabilidade do caller (lookup last RestSession).
 */
export function computeLongRestDelta(
  snapshot: CharacterRestSnapshot,
): LongRestDelta {
  const hdRestored: Partial<Record<HitDieType, number>> = {};
  for (const [die, max] of Object.entries(snapshot.hitDiceMax) as Array<
    [HitDieType, number]
  >) {
    const current = snapshot.hitDiceAvailable[die] ?? 0;
    hdRestored[die] = max - current;
  }

  const slotsDelta: Record<string, number> = {};
  for (const [lvl, max] of Object.entries(snapshot.spellSlotsMax)) {
    const current = snapshot.spellSlotsCurrent[lvl] ?? 0;
    slotsDelta[lvl] = max - current;
  }

  const exhaustionTo = Math.max(
    0,
    snapshot.exhaustionLevel - 1,
  ) as ExhaustionLevel;

  return {
    hpDelta: snapshot.hpMax - snapshot.hp,
    hdRestored,
    slotsDelta,
    exhaustionFrom: snapshot.exhaustionLevel,
    exhaustionTo,
    featuresRestored: [
      ...snapshot.shortRestFeatures,
      ...snapshot.longRestFeatures,
    ],
    errors: [],
  };
}

/**
 * 24h gate. Caller passa a timestamp da última long rest; helper
 * compara com agora.
 */
export function validateLongRestGate(input: {
  lastLongRestAt?: Date | null;
  now?: Date;
  /** Override do gate em horas (default 24). */
  minHoursBetween?: number;
}): { ok: boolean; hoursSinceLast?: number; reason?: string } {
  const now = input.now ?? new Date();
  const minHours = input.minHoursBetween ?? 24;
  if (!input.lastLongRestAt) return { ok: true };
  const diffMs = now.getTime() - input.lastLongRestAt.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < minHours) {
    return {
      ok: false,
      hoursSinceLast: hours,
      reason: `Long rest disponível em ${(minHours - hours).toFixed(1)}h (RAW 2024: 1 long rest / 24h).`,
    };
  }
  return { ok: true, hoursSinceLast: hours };
}
