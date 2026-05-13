

export type HitDieType = "d6" | "d8" | "d10" | "d12";

export type ExhaustionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CharacterRestSnapshot {
  hp: number;
  hpMax: number;

  hitDiceAvailable: Partial<Record<HitDieType, number>>;

  hitDiceMax: Partial<Record<HitDieType, number>>;
  exhaustionLevel: ExhaustionLevel;

  conModifier: number;

  spellSlotsCurrent: Record<string, number>;

  spellSlotsMax: Record<string, number>;

  shortRestFeatures: string[];

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

  hdRestored: Partial<Record<HitDieType, number>>;
  slotsDelta: Record<string, number>;
  exhaustionFrom: ExhaustionLevel;
  exhaustionTo: ExhaustionLevel;
  featuresRestored: string[];
  errors: string[];
}


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


export function validateLongRestGate(input: {
  lastLongRestAt?: Date | null;
  now?: Date;

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
