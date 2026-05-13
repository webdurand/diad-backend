import { parseRangeString } from "./combat-range";




export interface SpellShapeForRange {
  slug: string;
  range: string;
  attack_type?: "ranged" | "melee" | null;
  area_of_effect?: { type?: string; size?: number } | null;
}

export type SpellEffectiveRange =
  | {
      kind: "self-buff";
      attackRangeFt: null;
      aoeShape: null;
      rejectSelfAsTarget: false;
    }
  | {
      kind: "self-aoe";
      attackRangeFt: null;
      aoeShape: { type: string; size: number };
      rejectSelfAsTarget: false;
    }
  | {
      kind: "self-origin-attack";
      attackRangeFt: number;
      attackType: "ranged" | "melee";
      rejectSelfAsTarget: true;
      aoeShape: null;
    }
  | {
      kind: "normal";
      attackRangeFt: number;
      rejectSelfAsTarget: boolean;
      aoeShape: null;
    };


const SELF_ORIGIN_ATTACK_RANGE_OVERRIDES: Record<string, number> = {

  "produce-flame": 30,


  "flame-blade": 5,
};

function normalizeSlug(slug: string): string {
  return slug.replace(/-(phb|xphb|tce|xge|fttod)$/, "");
}


function hasRealAoeShape(
  aoe: SpellShapeForRange["area_of_effect"],
): aoe is { type: string; size: number } {
  return (
    aoe != null &&
    typeof aoe === "object" &&
    typeof (aoe as { type?: unknown }).type === "string" &&
    typeof (aoe as { size?: unknown }).size === "number"
  );
}

export function getSpellEffectiveRange(
  spell: SpellShapeForRange,
): SpellEffectiveRange {
  const rangeLower = (spell.range ?? "").trim().toLowerCase();
  const isSelfRange = rangeLower === "self";
  const aoe = hasRealAoeShape(spell.area_of_effect)
    ? spell.area_of_effect
    : null;
  const attackType = spell.attack_type ?? null;

  if (isSelfRange && aoe) {
    return {
      kind: "self-aoe",
      attackRangeFt: null,
      aoeShape: aoe,
      rejectSelfAsTarget: false,
    };
  }

  if (isSelfRange && attackType) {
    const normalized = normalizeSlug(spell.slug);
    const overrideFt = SELF_ORIGIN_ATTACK_RANGE_OVERRIDES[normalized];
    const defaultFt = attackType === "melee" ? 5 : 30;
    return {
      kind: "self-origin-attack",
      attackRangeFt: overrideFt ?? defaultFt,
      attackType,
      rejectSelfAsTarget: true,
      aoeShape: null,
    };
  }

  if (isSelfRange) {
    return {
      kind: "self-buff",
      attackRangeFt: null,
      aoeShape: null,
      rejectSelfAsTarget: false,
    };
  }

  const parsed = parseRangeString(spell.range);
  return {
    kind: "normal",
    attackRangeFt: parsed?.normal ?? 0,
    rejectSelfAsTarget: false,
    aoeShape: null,
  };
}
