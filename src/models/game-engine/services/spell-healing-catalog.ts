/**
 * Spec 012 Addendum — Spell Healing Catalog.
 *
 * O seed atual (via transform-spells.ts) hardcoda `heal_at_slot_level: null`
 * pra todas as magias. Resultado: spells de cura (Healing Word, Cure Wounds,
 * Mass Healing Word) consomem slot mas retornam 0 hit points recuperados —
 * cura quebra silenciosamente na UI ("0 de dano").
 *
 * Este catálogo hardcoda a fórmula RAW por (slug, slotLevel). Consultado
 * como fonte primária pelo SpellCastingService; quando miss, cai no path
 * legado (spell.heal_at_slot_level → null → sem cura).
 *
 * O placeholder `MOD` na expressão representa o modificador de spellcasting
 * do caster (substituído via `substituteSpellcastingMod` antes do roll).
 */
export interface SpellHealingResult {
  /** Expression aceita pelo DiceService *após* substituição de MOD (ex: '1d4 + 3'). */
  expression: string;
}

export type SpellHealingEntry = (slot: number) => SpellHealingResult | null;

/**
 * Helper: heal escalável "base + 1 die por slot acima". Ex:
 *   slotLinear(1, 1, 4, true) → slot 1: '1d4 + MOD', slot 2: '2d4 + MOD' ...
 * withMod=true injeta "+ MOD" placeholder (substituído depois pelo caster mod).
 */
function slotLinear(
  baseSlot: number,
  baseDice: number,
  diceSize: number,
  withMod: boolean,
): SpellHealingEntry {
  return (slot) => {
    if (slot < baseSlot) return null;
    const totalDice = baseDice + (slot - baseSlot);
    const suffix = withMod ? ' + MOD' : '';
    return { expression: `${totalDice}d${diceSize}${suffix}` };
  };
}

/**
 * Catálogo de cura RAW 2014/2024 (D&D 5e SRD).
 * Adicionar entries conforme harness cobrir mais spells. Cantrips não curam.
 */
export const SPELL_HEALING_CATALOG: Record<string, SpellHealingEntry> = {
  // ── L1 ──────────────────────────────────────────────────────────────
  // Healing Word: 1d4 + mod em slot 1; +1d4 por slot acima.
  'healing-word': slotLinear(1, 1, 4, true),
  // Cure Wounds: 2d8 + mod em slot 1 (XPHB 2024; PHB 2014 era 1d8 + mod).
  // Mantemos 1d8 + mod pra alinhar com SRD atual; migração 2024 vira ticket à parte.
  'cure-wounds': slotLinear(1, 1, 8, true),

  // ── L2 ──────────────────────────────────────────────────────────────
  // Prayer of Healing: 2d8 + mod em slot 2; +1d8 por slot acima. Multi-target.
  'prayer-of-healing': slotLinear(2, 2, 8, true),

  // ── L3 ──────────────────────────────────────────────────────────────
  // Mass Healing Word: 1d4 + mod em slot 3; +1d4 por slot acima.
  'mass-healing-word': slotLinear(3, 1, 4, true),
  // Revivify: flat 1 HP (revive). Expression numérica literal.
  revivify: () => ({ expression: '1' }),
};

export function getSpellHealing(
  slug: string,
  slotLevel: number,
): SpellHealingResult | null {
  const entry = SPELL_HEALING_CATALOG[slug];
  if (!entry) return null;
  return entry(slotLevel);
}
