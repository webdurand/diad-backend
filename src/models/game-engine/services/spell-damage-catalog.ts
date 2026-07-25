
export interface SpellDamageResult {

  expression: string;

  type: string;
}

export type SpellDamageEntry = (
  slot: number,
  casterLevel: number,
) => SpellDamageResult | null;


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

  "fire-bolt": cantripScaling(1, 10, "fire"),
  "sacred-flame": cantripScaling(1, 8, "radiant"),
  "shocking-grasp": cantripScaling(1, 8, "lightning"),
  "eldritch-blast": cantripScaling(1, 10, "force"),
  "acid-splash": cantripScaling(1, 6, "acid"),
  "poison-spray": cantripScaling(1, 12, "poison"),
  "ray-of-frost": cantripScaling(1, 8, "cold"),
  "chill-touch": cantripScaling(1, 10, "necrotic"),
  thunderclap: cantripScaling(1, 6, "thunder"),




  "magic-missile": (slot) => {
    if (slot < 1) return null;
    const darts = slot + 2;
    return { expression: `${darts}d4+${darts}`, type: "force" };
  },
  "burning-hands": bySlotLinear(1, 3, "fire", 6, 1),
  thunderwave: bySlotLinear(1, 2, "thunder", 8, 1),
  "witch-bolt": bySlotLinear(1, 2, "lightning", 12, 1),
  "guiding-bolt": bySlotLinear(1, 4, "radiant", 6, 1),
  "inflict-wounds": bySlotLinear(1, 3, "necrotic", 10, 1),



  "chromatic-orb": bySlotLinear(1, 3, "acid", 8, 1),




  "scorching-ray": (slot) => {
    if (slot < 2) return null;
    const rays = 3 + (slot - 2);
    return { expression: `${2 * rays}d6`, type: "fire" };
  },
  shatter: bySlotLinear(2, 3, "thunder", 8, 1),
  "flaming-sphere": bySlotLinear(2, 2, "fire", 6, 1),
  "melfs-acid-arrow": bySlotLinear(2, 4, "acid", 4, 1),


  fireball: bySlotLinear(3, 8, "fire", 6, 1),
  "lightning-bolt": bySlotLinear(3, 8, "lightning", 6, 1),
  "call-lightning": bySlotLinear(3, 3, "lightning", 10, 1),
  "vampiric-touch": bySlotLinear(3, 3, "necrotic", 6, 1),


  "ice-storm": bySlotLinear(4, 2, "bludgeoning", 8, 1),

  "wall-of-fire": bySlotLinear(4, 5, "fire", 8, 1),
  blight: bySlotLinear(4, 8, "necrotic", 8, 1),


  "cone-of-cold": bySlotLinear(5, 8, "cold", 8, 1),
  cloudkill: bySlotLinear(5, 5, "poison", 8, 1),
  "flame-strike": bySlotLinear(5, 4, "fire", 6, 1),


  "chain-lightning": bySlotLinear(6, 10, "lightning", 8, 0),
  disintegrate: (slot) => {
    if (slot < 6) return null;
    const extra = slot - 6;
    const dice = 10 + extra * 3;
    return { expression: `${dice}d6+40`, type: "force" };
  },


  "finger-of-death": (slot) => {
    if (slot < 7) return null;
    return { expression: "7d8+30", type: "necrotic" };
  },
  "delayed-blast-fireball": bySlotLinear(7, 12, "fire", 6, 1),
  "fire-storm": bySlotLinear(7, 7, "fire", 10, 0),


  "incendiary-cloud": (slot) => {
    if (slot < 8) return null;
    return { expression: "10d8", type: "fire" };
  },
  sunburst: bySlotLinear(8, 12, "radiant", 6, 0),


  "meteor-swarm": (slot) => {
    if (slot < 9) return null;
    return { expression: "20d6+20d6", type: "fire" };
  },
  "storm-of-vengeance": bySlotLinear(9, 2, "thunder", 6, 0),
  "power-word-kill": () => null,
};


export function getSpellDamage(
  spellSlug: string,
  slotLevel: number,
  casterLevel: number,
): SpellDamageResult | null {
  const entry = SPELL_DAMAGE_CATALOG[spellSlug.toLowerCase()];
  if (!entry) return null;
  return entry(slotLevel, casterLevel);
}
