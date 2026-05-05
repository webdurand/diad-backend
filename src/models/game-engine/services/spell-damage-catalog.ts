/**
 * Spec 005 Addendum — Spell Damage Catalog.
 *
 * O seed atual (via transform-spells.ts) não preserva `damage_at_slot_level`
 * do source 5etools — só damage_type + cantrip scaling. Resultado: spells
 * leveled de damage (Magic Missile, Fireball, etc.) não rolam dano no cast.
 *
 * Este catálogo hardcoda a fórmula RAW por (slug, slotLevel). Consultado como
 * fonte primária pelo SpellCastingService; quando miss, cai no path legado
 * (spell.damage.damage_at_slot_level → cantrip scaling).
 */
export interface SpellDamageResult {
  /** Expression aceita pelo DiceService (ex: '3d4+3', '8d6'). */
  expression: string;
  /** Tipo de dano RAW. */
  type: string;
}

export type SpellDamageEntry = (
  slot: number,
  casterLevel: number,
) => SpellDamageResult | null;

/**
 * Helper: retorna fórmula xd6 etc. por slot com scaling linear.
 * Ex: baseDiceOfType(3, 6, 'fire', 4, 1) em slot=5 → '5d6' (4 base + 1 extra).
 */
function bySlotLinear(
  baseSlot: number,
  baseDice: number,
  type: string,
  diceSize: number,
  extraDicePerSlotAbove: number,
  modifier = 0,
): SpellDamageEntry {
  return (slot) => {
    if (slot < baseSlot) return null;
    const totalDice = baseDice + extraDicePerSlotAbove * (slot - baseSlot);
    const modStr =
      modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : "";
    return { expression: `${totalDice}d${diceSize}${modStr}`, type };
  };
}

/**
 * Cantrip scaling RAW (D&D 5e): dado de base escala em 1/5/11/17.
 */
function cantripScaling(
  baseDice: number,
  diceSize: number,
  type: string,
  modifier = 0,
): SpellDamageEntry {
  return (_slot, casterLevel) => {
    const n =
      casterLevel >= 17
        ? baseDice * 4
        : casterLevel >= 11
          ? baseDice * 3
          : casterLevel >= 5
            ? baseDice * 2
            : baseDice;
    const modStr =
      modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : "";
    return { expression: `${n}d${diceSize}${modStr}`, type };
  };
}

const SPELL_DAMAGE_CATALOG: Record<string, SpellDamageEntry> = {
  // ── Cantrips ────────────────────────────────────────────────────────
  "fire-bolt": cantripScaling(1, 10, "fire"),
  "sacred-flame": cantripScaling(1, 8, "radiant"),
  "shocking-grasp": cantripScaling(1, 8, "lightning"),
  "eldritch-blast": cantripScaling(1, 10, "force"),
  "acid-splash": cantripScaling(1, 6, "acid"),
  "poison-spray": cantripScaling(1, 12, "poison"),
  "ray-of-frost": cantripScaling(1, 8, "cold"),
  "chill-touch": cantripScaling(1, 8, "necrotic"),
  thunderclap: cantripScaling(1, 6, "thunder"),

  // ── L1 ──────────────────────────────────────────────────────────────
  // Magic Missile: 3 darts at L1, +1 per slot above. Each dart = 1d4+1.
  // Total = N d4 + N onde N = 3 + (slot - 1) = slot + 2.
  "magic-missile": (slot) => {
    if (slot < 1) return null;
    const darts = slot + 2;
    return { expression: `${darts}d4+${darts}`, type: "force" };
  },
  "burning-hands": bySlotLinear(1, 3, "fire", 6, 1),
  thunderwave: bySlotLinear(1, 2, "thunder", 8, 1),
  "witch-bolt": bySlotLinear(1, 1, "lightning", 12, 1),
  "guiding-bolt": bySlotLinear(1, 4, "radiant", 6, 1),
  "inflict-wounds": bySlotLinear(1, 3, "necrotic", 10, 1),
  // Chromatic Orb (Sorcerer/Wizard): 3d8 base + 1d8/upcast; damage type
  // escolhido pelo caster (acid/cold/fire/lightning/poison/thunder). DIAD
  // MVP: fixa 'fire' (subsystem de damage-type selection V2).
  "chromatic-orb": bySlotLinear(1, 3, "fire", 8, 1),

  // ── L2 ──────────────────────────────────────────────────────────────
  // Scorching Ray: 3 rays at L2, +1 per slot. Each ray = 2d6 fire (attack roll per ray).
  // Simplificação MVP: trata como 1 roll agregado — N rays × 2d6 = (2N)d6.
  "scorching-ray": (slot) => {
    if (slot < 2) return null;
    const rays = 3 + (slot - 2);
    return { expression: `${2 * rays}d6`, type: "fire" };
  },
  shatter: bySlotLinear(2, 3, "thunder", 8, 1),
  "flaming-sphere": bySlotLinear(2, 2, "fire", 6, 1),
  "melfs-acid-arrow": bySlotLinear(2, 4, "acid", 4, 1),

  // ── L3 ──────────────────────────────────────────────────────────────
  fireball: bySlotLinear(3, 8, "fire", 6, 1),
  "lightning-bolt": bySlotLinear(3, 8, "lightning", 6, 1),
  "call-lightning": bySlotLinear(3, 3, "lightning", 10, 1),
  "vampiric-touch": bySlotLinear(3, 3, "necrotic", 6, 1),

  // ── L4 ──────────────────────────────────────────────────────────────
  "ice-storm": bySlotLinear(4, 2, "bludgeoning", 8, 1),
  // Wall of Fire: 5d8 fire passivo; damage per tick. MVP: cast roll single 5d8.
  "wall-of-fire": bySlotLinear(4, 5, "fire", 8, 1),
  blight: bySlotLinear(4, 8, "necrotic", 8, 1),

  // ── L5 ──────────────────────────────────────────────────────────────
  "cone-of-cold": bySlotLinear(5, 8, "cold", 8, 1),
  cloudkill: bySlotLinear(5, 5, "poison", 8, 1),
  "flame-strike": bySlotLinear(5, 4, "fire", 6, 1),

  // ── L6 ──────────────────────────────────────────────────────────────
  "chain-lightning": bySlotLinear(6, 10, "lightning", 8, 0),
  disintegrate: (slot) => {
    if (slot < 6) return null;
    const extra = slot - 6;
    const dice = 10 + extra * 3;
    return { expression: `${dice}d6+40`, type: "force" };
  },

  // ── L7 ──────────────────────────────────────────────────────────────
  "finger-of-death": (slot) => {
    if (slot < 7) return null;
    return { expression: "7d8+30", type: "necrotic" };
  },
  "delayed-blast-fireball": bySlotLinear(7, 12, "fire", 6, 1),
  "fire-storm": bySlotLinear(7, 7, "fire", 10, 0),

  // ── L8 ──────────────────────────────────────────────────────────────
  "incendiary-cloud": (slot) => {
    if (slot < 8) return null;
    return { expression: "10d8", type: "fire" };
  },

  // ── L9 ──────────────────────────────────────────────────────────────
  "meteor-swarm": (slot) => {
    if (slot < 9) return null;
    return { expression: "20d6+20d6", type: "fire" };
  },
  "power-word-kill": () => null,
};

/**
 * Retorna a fórmula de damage para um spell no slot/caster-level informados.
 * Se retornar null, caller deve cair no fallback (spell.damage_at_slot_level).
 */
export function getSpellDamage(
  spellSlug: string,
  slotLevel: number,
  casterLevel: number,
): SpellDamageResult | null {
  const entry = SPELL_DAMAGE_CATALOG[spellSlug.toLowerCase()];
  if (!entry) return null;
  return entry(slotLevel, casterLevel);
}
