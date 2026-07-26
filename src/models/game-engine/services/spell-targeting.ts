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

  "chromatic-orb": (slotLevel: number) =>
    Math.max(2, slotLevel + 1),

  "chain-lightning": (slotLevel: number) =>
    4 + Math.max(0, slotLevel - 6),

  bless: () => 3,
  aid: () => 3,
  "beacon-of-hope": () => Number.POSITIVE_INFINITY,
  "freedom-of-movement": (slotLevel: number) =>
    1 + Math.max(0, slotLevel - 4),
};

const LEGACY_ACID_SPLASH_TARGETS = () => 2;


export const MULTI_TARGET_NON_AOE_SPELLS: Record<
  string,
  (slotLevel: number, casterLevel: number) => number
> = new Proxy(MULTI_TARGET_CATALOG, {
  has(target, prop: string) {
    if (prop.toLowerCase().endsWith("-phb") && normalizeSpellSlug(prop) === "acid-splash") {
      return true;
    }
    return normalizeSpellSlug(prop) in target;
  },
  get(target, prop: string) {
    if (prop.toLowerCase().endsWith("-phb") && normalizeSpellSlug(prop) === "acid-splash") {
      return LEGACY_ACID_SPLASH_TARGETS;
    }
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

const REPEATABLE_PROJECTILE_SPELLS = new Set([
  "magic-missile",
  "eldritch-blast",
  "scorching-ray",
]);

export function repeatsFirstTargetToMaximum(
  spell: Pick<SpellEntity, "slug">,
): boolean {
  return REPEATABLE_PROJECTILE_SPELLS.has(normalizeSpellSlug(spell.slug));
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
    case "chromatic-orb": {
      return {
        expression: `${Math.max(3, slotLevel + 2)}d8`,
        type: "acid",
      };
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

function cubeOffsetRange(sizeCells: number): { start: number; end: number } {
  const size = Math.max(1, Math.floor(sizeCells));
  const start = -Math.floor((size - 1) / 2);
  return { start, end: start + size - 1 };
}


const CANONICAL_AOE: Record<string, { kind: AoeShapeKind; sizeFt: number }> = {

  "acid-splash": { kind: "sphere", sizeFt: 5 },
  fireball: { kind: "sphere", sizeFt: 20 },
  // Fire Storm is a chain of up to ten contiguous 10-foot cubes. A single
  // placement is one cube; the multi-cube picker expands this footprint.
  "fire-storm": { kind: "cube", sizeFt: 10 },
  "delayed-blast-fireball": { kind: "sphere", sizeFt: 20 },
  shatter: { kind: "sphere", sizeFt: 10 },
  "vitriolic-sphere": { kind: "sphere", sizeFt: 20 },
  "watery-sphere": { kind: "sphere", sizeFt: 5 },
  weird: { kind: "sphere", sizeFt: 30 },
  "zone-of-truth": { kind: "sphere", sizeFt: 15 },
  "spirit-guardians": { kind: "sphere", sizeFt: 15 },
  "spike-growth": { kind: "sphere", sizeFt: 20 },
  "fog-cloud": { kind: "sphere", sizeFt: 20 },
  sleep: { kind: "sphere", sizeFt: 5 },
  "hypnotic-pattern": { kind: "cube", sizeFt: 30 },
  cloudkill: { kind: "sphere", sizeFt: 20 },
  "hunger-of-hadar": { kind: "sphere", sizeFt: 20 },
  "destructive-wave": { kind: "sphere", sizeFt: 30 },
  earthquake: { kind: "sphere", sizeFt: 100 },

  thunderwave: { kind: "cube", sizeFt: 15 },
  "black-tentacles": { kind: "cube", sizeFt: 20 },
  grease: { kind: "cube", sizeFt: 10 },
  web: { kind: "cube", sizeFt: 20 },
  "cloud-of-daggers": { kind: "cube", sizeFt: 5 },

  "sleet-storm": { kind: "cylinder", sizeFt: 20 },
  sunburst: { kind: "cylinder", sizeFt: 60 },
  "storm-of-vengeance": { kind: "cylinder", sizeFt: 360 },

  "burning-hands": { kind: "cone", sizeFt: 15 },
  "cone-of-cold": { kind: "cone", sizeFt: 60 },
  "color-spray": { kind: "cone", sizeFt: 15 },
  "ice-knife": { kind: "sphere", sizeFt: 5 },
  "call-lightning": { kind: "sphere", sizeFt: 5 },
  "dragons-breath": { kind: "cone", sizeFt: 15 },

  "lightning-bolt": { kind: "line", sizeFt: 100 },
  "wall-of-fire": { kind: "line", sizeFt: 60 },
};

export function getAoeShape(
  spell: Pick<SpellEntity, "slug" | "area_of_effect">,
): AoeShape | null {
  const rawSlug = String((spell as any).slug ?? "").toLowerCase();
  const normalized = normalizeSpellSlug(rawSlug);
  if (normalized === "acid-splash" && rawSlug.endsWith("-phb")) {
    return null;
  }
  const canonical = CANONICAL_AOE[normalized];
  if (canonical) {
    return {
      kind: canonical.kind,
      radiusCells: Math.max(1, Math.ceil(canonical.sizeFt / 5)),
      sizeFt: canonical.sizeFt,
    };
  }

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
    const { start, end } = cubeOffsetRange(shape.radiusCells);
    return dx >= start && dx <= end && dy >= start && dy <= end;
  }

  return Math.max(Math.abs(dx), Math.abs(dy)) <= shape.radiusCells;
}

export function cellInSelfOriginAoe(
  cell: { x: number; y: number },
  origin: { x: number; y: number },
  shape: AoeShape,
): boolean {
  if (shape.kind === "sphere" || shape.kind === "cylinder") {
    return (
      Math.max(
        Math.abs(cell.x - origin.x),
        Math.abs(cell.y - origin.y),
      ) <= shape.radiusCells
    );
  }
  return cellInAoe(cell, origin, shape);
}
