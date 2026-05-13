

export interface ClassAvailability {

  available: boolean;

  canonicalSubclasses: string[];
}

const CLASS_AVAILABILITY: Record<string, ClassAvailability> = {
  fighter: { available: true, canonicalSubclasses: ["champion"] },
  barbarian: { available: true, canonicalSubclasses: ["berserker"] },
  cleric: { available: true, canonicalSubclasses: ["life"] },
  paladin: { available: true, canonicalSubclasses: ["devotion"] },
  wizard: { available: true, canonicalSubclasses: ["evocation"] },
  sorcerer: { available: true, canonicalSubclasses: ["draconic"] },


  druid: { available: true, canonicalSubclasses: ["druid-land", "land"] },

  bard: { available: true, canonicalSubclasses: ["bard-lore", "lore"] },

  warlock: { available: true, canonicalSubclasses: ["warlock-fiend", "fiend"] },

  monk: {
    available: true,
    canonicalSubclasses: ["monk-open-hand", "open-hand"],
  },

  rogue: { available: true, canonicalSubclasses: ["rogue-thief", "thief"] },

  ranger: { available: true, canonicalSubclasses: ["ranger-hunter", "hunter"] },
};

function canonicalizeClassSlug(slug: string): string {
  return slug.replace(/-phb$/, "");
}

export function isClassAvailable(classSlug: string): boolean {
  return (
    CLASS_AVAILABILITY[canonicalizeClassSlug(classSlug)]?.available ?? false
  );
}

export function getCanonicalSubclassSlugs(classSlug: string): string[] {
  return (
    CLASS_AVAILABILITY[canonicalizeClassSlug(classSlug)]?.canonicalSubclasses ??
    []
  );
}
