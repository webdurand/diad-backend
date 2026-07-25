interface DisintegrateResolution {
  spellSlug: string;
  hpBefore: number;
  hpAfter: number;
  damageApplied: number;
}

function normalizeSpellSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/-(phb|xphb|srd52)$/, "");
}

export function shouldDisintegrateTarget({
  spellSlug,
  hpBefore,
  hpAfter,
  damageApplied,
}: DisintegrateResolution): boolean {
  return (
    normalizeSpellSlug(spellSlug) === "disintegrate" &&
    hpBefore > 0 &&
    hpAfter === 0 &&
    damageApplied > 0
  );
}
