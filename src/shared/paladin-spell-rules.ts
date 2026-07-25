import type { CharacterClassEntity } from "src/entities";
import { normalizeClassSlug } from "./srd-constants";

export interface AlwaysPreparedSpellSpec {
  slug: string;
  name: string;
  level: number;
  minimumPaladinLevel: number;
  grantedBy: "paladins-smite" | "faithful-steed" | "oath-of-devotion";
}

const PALADINS_SMITE_SPELL: AlwaysPreparedSpellSpec = {
  slug: "divine-smite",
  name: "Divine Smite",
  level: 1,
  minimumPaladinLevel: 2,
  grantedBy: "paladins-smite",
};

const FAITHFUL_STEED_SPELL: AlwaysPreparedSpellSpec = {
  slug: "find-steed",
  name: "Find Steed",
  level: 2,
  minimumPaladinLevel: 5,
  grantedBy: "faithful-steed",
};

const OATH_OF_DEVOTION_SPELLS: AlwaysPreparedSpellSpec[] = [
  {
    slug: "protection-from-evil-and-good",
    name: "Protection from Evil and Good",
    level: 1,
    minimumPaladinLevel: 3,
    grantedBy: "oath-of-devotion",
  },
  {
    slug: "shield-of-faith",
    name: "Shield of Faith",
    level: 1,
    minimumPaladinLevel: 3,
    grantedBy: "oath-of-devotion",
  },
  {
    slug: "aid",
    name: "Aid",
    level: 2,
    minimumPaladinLevel: 5,
    grantedBy: "oath-of-devotion",
  },
  {
    slug: "zone-of-truth",
    name: "Zone of Truth",
    level: 2,
    minimumPaladinLevel: 5,
    grantedBy: "oath-of-devotion",
  },
  {
    slug: "beacon-of-hope",
    name: "Beacon of Hope",
    level: 3,
    minimumPaladinLevel: 9,
    grantedBy: "oath-of-devotion",
  },
  {
    slug: "dispel-magic",
    name: "Dispel Magic",
    level: 3,
    minimumPaladinLevel: 9,
    grantedBy: "oath-of-devotion",
  },
  {
    slug: "freedom-of-movement",
    name: "Freedom of Movement",
    level: 4,
    minimumPaladinLevel: 13,
    grantedBy: "oath-of-devotion",
  },
  {
    slug: "guardian-of-faith",
    name: "Guardian of Faith",
    level: 4,
    minimumPaladinLevel: 13,
    grantedBy: "oath-of-devotion",
  },
  {
    slug: "commune",
    name: "Commune",
    level: 5,
    minimumPaladinLevel: 17,
    grantedBy: "oath-of-devotion",
  },
  {
    slug: "flame-strike",
    name: "Flame Strike",
    level: 5,
    minimumPaladinLevel: 17,
    grantedBy: "oath-of-devotion",
  },
];

function isDevotionSubclass(slug: string | null | undefined): boolean {
  const normalized = String(slug ?? "").toLowerCase();
  return normalized === "devotion" || normalized.includes("devotion");
}

export function getAlwaysPreparedPaladinSpells(
  characterClasses: readonly CharacterClassEntity[],
  is2024Rules: boolean,
): AlwaysPreparedSpellSpec[] {
  if (!is2024Rules) return [];

  const paladin = characterClasses.find(
    (characterClass) =>
      normalizeClassSlug(characterClass.class?.slug ?? "") === "paladin",
  );
  if (!paladin) return [];

  const available: AlwaysPreparedSpellSpec[] = [];
  if (paladin.class_level >= PALADINS_SMITE_SPELL.minimumPaladinLevel) {
    available.push(PALADINS_SMITE_SPELL);
  }
  if (paladin.class_level >= FAITHFUL_STEED_SPELL.minimumPaladinLevel) {
    available.push(FAITHFUL_STEED_SPELL);
  }
  if (isDevotionSubclass(paladin.subclass?.slug)) {
    available.push(
      ...OATH_OF_DEVOTION_SPELLS.filter(
        (spell) => paladin.class_level >= spell.minimumPaladinLevel,
      ),
    );
  }
  return available;
}

export function normalizePreparedSpellSlug(slug: string): string {
  return slug.toLowerCase().replace(/-(phb|xphb|srd52)$/, "");
}
