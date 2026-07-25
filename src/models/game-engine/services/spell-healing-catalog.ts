
export interface SpellHealingResult {

  expression: string;
}

export type SpellHealingEntry = (slot: number) => SpellHealingResult | null;


function slotLinear(
  baseSlot: number,
  baseDice: number,
  diceSize: number,
  withMod: boolean,
  dicePerSlot = 1,
): SpellHealingEntry {
  return (slot) => {
    if (slot < baseSlot) return null;
    const totalDice = baseDice + (slot - baseSlot) * dicePerSlot;
    const suffix = withMod ? " + MOD" : "";
    return { expression: `${totalDice}d${diceSize}${suffix}` };
  };
}


const SPELL_HEALING_CATALOG: Record<string, SpellHealingEntry> = {


  "healing-word": slotLinear(1, 2, 4, true, 2),


  "cure-wounds": slotLinear(1, 2, 8, true, 2),



  "prayer-of-healing": slotLinear(2, 2, 8, true),



  "mass-healing-word": slotLinear(3, 2, 4, true),

  revivify: () => ({ expression: "1" }),
  heal: (slot) =>
    slot < 6
      ? null
      : { expression: String(70 + Math.max(0, slot - 6) * 10) },
};

export function getSpellHealing(
  slug: string,
  slotLevel: number,
): SpellHealingResult | null {
  const entry = SPELL_HEALING_CATALOG[slug];
  if (!entry) return null;
  return entry(slotLevel);
}
