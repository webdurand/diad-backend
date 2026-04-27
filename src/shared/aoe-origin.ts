import type { AoEOriginType } from "src/shared/aoe-origin.types";

export interface SpellLikeAoeInput {
  range: string;
  area_of_effect: { type: string; size: number } | null;
}

/**
 * Deriva o tipo de origem de uma magia/ação a partir dos campos do SRD.
 *
 * Algoritmo (research.md R-001):
 *   - sem area_of_effect            → null  (não é AoE)
 *   - range comeca com "Self"       → "self"
 *   - range é numérico (pés/milhas) → "point"
 *   - qualquer outro                → "self" (fallback conservador)
 *
 * Nunca devolve "fixed" — esse valor é atributo de entidade
 * (armadilha/efeito persistente), não derivável do SRD.
 */
export function deriveOriginType(
  spell: SpellLikeAoeInput,
): AoEOriginType | null {
  if (spell.area_of_effect == null) return null;

  const range = spell.range.trim();
  if (range.toLowerCase().startsWith("self")) return "self";

  if (/^\d/.test(range)) return "point";

  // Touch e outros (raro, mas coberto)
  if (range.toLowerCase() === "touch") return "point";

  return "self";
}
