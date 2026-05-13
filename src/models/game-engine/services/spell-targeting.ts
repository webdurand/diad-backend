import { SpellEntity } from "src/entities/spell.entity";




function normalizeSpellSlug(slug: string): string {
  return slug.replace(/-(phb|xphb|tce|xge|fttod)$/, "");
}

const MULTI_TARGET_CATALOG: Record<
  string,
  (slotLevel: number, casterLevel: number) => number
> = {

  "magic-missile": (slotLevel: number) =>
    Math.min(3 + Math.max(0, slotLevel - 1), 10),

  "eldritch-blast": (_slot: number, casterLevel: number) =>
    casterLevel >= 17 ? 4 : casterLevel >= 11 ? 3 : casterLevel >= 5 ? 2 : 1,

  "scorching-ray": (slotLevel: number) => 3 + Math.max(0, slotLevel - 2),

  "acid-splash": () => 2,

  bless: () => 3,
};


export const MULTI_TARGET_NON_AOE_SPELLS: Record<
  string,
  (slotLevel: number, casterLevel: number) => number
> = new Proxy(MULTI_TARGET_CATALOG, {
  has(target, prop: string) {
    return normalizeSpellSlug(prop) in target;
  },
  get(target, prop: string) {
    const normalized = normalizeSpellSlug(prop);
    return target[normalized];
  },
});


export function isAoeSpell(
  spell: Pick<SpellEntity, "slug" | "area_of_effect">,
): boolean {
  return getAoeShape(spell) !== null;
}

export function isMultiTargetNonAoeSpell(
  spell: Pick<SpellEntity, "slug">,
): boolean {
  return spell.slug in MULTI_TARGET_NON_AOE_SPELLS;
}


export function maxTargetsFor(
  spell: Pick<SpellEntity, "slug" | "area_of_effect">,
  slotLevel: number,
  casterLevel: number,
): number {
  if (isAoeSpell(spell)) return Number.POSITIVE_INFINITY;
  if (isMultiTargetNonAoeSpell(spell)) {
    return MULTI_TARGET_NON_AOE_SPELLS[spell.slug](slotLevel, casterLevel);
  }
  return 1;
}


export interface PerHitDamage {
  expression: string;
  type: string;
}

export function getPerHitDamage(
  slug: string,
  slotLevel: number,
  casterLevel: number,
): PerHitDamage | null {
  const normalized = slug.replace(/-(phb|xphb|tce|xge|fttod)$/, "");
  switch (normalized) {
    case "magic-missile":
      return { expression: "1d4+1", type: "force" };
    case "scorching-ray":
      return { expression: "2d6", type: "fire" };
    case "eldritch-blast": {
      return { expression: "1d10", type: "force" };
    }
    case "acid-splash": {
      const tier =
        casterLevel >= 17
          ? 4
          : casterLevel >= 11
            ? 3
            : casterLevel >= 5
              ? 2
              : 1;
      return { expression: `${tier}d6`, type: "acid" };
    }
    default:
      return null;
  }
}


export type AoeShapeKind = "sphere" | "cube" | "cone" | "line" | "cylinder";

export interface AoeShape {
  kind: AoeShapeKind;

  radiusCells: number;

  sizeFt: number;
}


const CANONICAL_AOE: Record<string, { kind: AoeShapeKind; sizeFt: number }> = {

  fireball: { kind: "sphere", sizeFt: 20 },
  "delayed-blast-fireball": { kind: "sphere", sizeFt: 20 },
  shatter: { kind: "sphere", sizeFt: 10 },
  "vitriolic-sphere": { kind: "sphere", sizeFt: 20 },
  "watery-sphere": { kind: "sphere", sizeFt: 5 },
  weird: { kind: "sphere", sizeFt: 30 },
  "zone-of-truth": { kind: "sphere", sizeFt: 15 },
  "spirit-guardians": { kind: "sphere", sizeFt: 15 },
  "spike-growth": { kind: "sphere", sizeFt: 20 },
  cloudkill: { kind: "sphere", sizeFt: 20 },
  "hunger-of-hadar": { kind: "sphere", sizeFt: 20 },
  "destructive-wave": { kind: "sphere", sizeFt: 30 },
  earthquake: { kind: "sphere", sizeFt: 100 },

  thunderwave: { kind: "cube", sizeFt: 15 },
  "black-tentacles": { kind: "cube", sizeFt: 20 },
  web: { kind: "cube", sizeFt: 20 },

  "burning-hands": { kind: "cone", sizeFt: 15 },
  "cone-of-cold": { kind: "cone", sizeFt: 60 },
  "color-spray": { kind: "cone", sizeFt: 15 },
  "ice-knife": { kind: "sphere", sizeFt: 5 },
  "dragons-breath": { kind: "cone", sizeFt: 15 },

  "lightning-bolt": { kind: "line", sizeFt: 100 },
  "wall-of-fire": { kind: "line", sizeFt: 60 },
};

export function getAoeShape(
  spell: Pick<SpellEntity, "slug" | "area_of_effect">,
): AoeShape | null {
  const aoe = spell.area_of_effect as
    | { type?: string; size?: number; tags?: string[] }
    | null
    | undefined;

  if (aoe && typeof aoe.type === "string" && typeof aoe.size === "number") {
    const kindRaw = aoe.type.toLowerCase();
    if (
      kindRaw === "sphere" ||
      kindRaw === "cube" ||
      kindRaw === "cone" ||
      kindRaw === "line" ||
      kindRaw === "cylinder"
    ) {
      return {
        kind: kindRaw,
        radiusCells: Math.max(1, Math.ceil(aoe.size / 5)),
        sizeFt: aoe.size,
      };
    }
  }


  const normalized = normalizeSpellSlug((spell as any).slug ?? "");
  const canonical = CANONICAL_AOE[normalized];
  if (canonical) {
    return {
      kind: canonical.kind,
      radiusCells: Math.max(1, Math.ceil(canonical.sizeFt / 5)),
      sizeFt: canonical.sizeFt,
    };
  }

  return null;
}


export function cellInAoe(
  cell: { x: number; y: number },
  origin: { x: number; y: number },
  shape: AoeShape,
): boolean {
  const dx = cell.x - origin.x;
  const dy = cell.y - origin.y;
  if (shape.kind === "sphere" || shape.kind === "cylinder") {
    return Math.sqrt(dx * dx + dy * dy) <= shape.radiusCells;
  }
  if (shape.kind === "cube") {
    return (
      Math.abs(dx) <= shape.radiusCells && Math.abs(dy) <= shape.radiusCells
    );
  }

  return Math.max(Math.abs(dx), Math.abs(dy)) <= shape.radiusCells;
}
