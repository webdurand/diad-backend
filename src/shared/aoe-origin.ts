import type { AoEOriginType } from "src/shared/aoe-origin.types";

export interface SpellLikeAoeInput {
  range: string;
  area_of_effect: { type: string; size: number } | null;
}


export function deriveOriginType(
  spell: SpellLikeAoeInput,
): AoEOriginType | null {
  if (spell.area_of_effect == null) return null;

  const range = spell.range.trim();
  if (range.toLowerCase().startsWith("self")) return "self";

  if (/^\d/.test(range)) return "point";


  if (range.toLowerCase() === "touch") return "point";

  return "self";
}
