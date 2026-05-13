
export interface SpellHealingResult {

  expression: string;
}

export type SpellHealingEntry = (slot: number) => SpellHealingResult | null;


function slotLinear(
  baseSlot: number,
  baseDice: number,
  diceSize: number,
  withMod: boolean,
): SpellHealingEntry {
  return (slot) => {
    if (slot < baseSlot) return null;
    const totalDice = baseDice + (slot - baseSlot);
    const suffix = withMod ? " + MOD" : "";
    return { expression: `${totalDice}d${diceSize}${suffix}` };
  };
}


const SPELL_HEALING_CATALOG: Record<string, SpellHealingEntry> = {


  "healing-word": slotLinear(1, 1, 4, true),


  "cure-wounds": slotLinear(1, 1, 8, true),



  "prayer-of-healing": slotLinear(2, 2, 8, true),



  "mass-healing-word": slotLinear(3, 1, 4, true),

  revivify: () => ({ expression: "1" }),
};

export function getSpellHealing(
  slug: string,
  slotLevel: number,
): SpellHealingResult | null {
  const entry = SPELL_HEALING_CATALOG[slug];
  if (!entry) return null;
  return entry(slotLevel);
}
