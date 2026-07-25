export type SpellAutomationStatus = "ready";

export type SpellAutomationBehaviorKind =
  | "attack_damage"
  | "save_damage"
  | "healing"
  | "buff"
  | "condition"
  | "mark"
  | "persistent_area"
  | "summon";

export interface SpellAutomationEntry {
  slug: string;
  status: SpellAutomationStatus;
  behaviorKind: SpellAutomationBehaviorKind;
  automationTags: string[];
}

const SPELL_AUTOMATION_ENTRIES: SpellAutomationEntry[] = [
  {
    slug: "fire-bolt",
    status: "ready",
    behaviorKind: "attack_damage",
    automationTags: ["cantrip", "damage", "ranged"],
  },
  {
    slug: "ray-of-frost",
    status: "ready",
    behaviorKind: "attack_damage",
    automationTags: ["cantrip", "damage", "ranged", "control"],
  },
  {
    slug: "sacred-flame",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["cantrip", "damage", "save"],
  },
  {
    slug: "acid-splash",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["cantrip", "damage", "save"],
  },
  {
    slug: "eldritch-blast",
    status: "ready",
    behaviorKind: "attack_damage",
    automationTags: ["cantrip", "damage", "ranged"],
  },
  {
    slug: "shocking-grasp",
    status: "ready",
    behaviorKind: "attack_damage",
    automationTags: ["cantrip", "damage", "melee"],
  },
  {
    slug: "magic-missile",
    status: "ready",
    behaviorKind: "attack_damage",
    automationTags: ["damage", "multi_target"],
  },
  {
    slug: "burning-hands",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["damage", "aoe"],
  },
  {
    slug: "thunderwave",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["damage", "aoe", "control"],
  },
  {
    slug: "guiding-bolt",
    status: "ready",
    behaviorKind: "attack_damage",
    automationTags: ["damage", "ranged", "buff"],
  },
  {
    slug: "cure-wounds",
    status: "ready",
    behaviorKind: "healing",
    automationTags: ["healing"],
  },
  {
    slug: "healing-word",
    status: "ready",
    behaviorKind: "healing",
    automationTags: ["healing", "bonus_action"],
  },
  {
    slug: "mass-healing-word",
    status: "ready",
    behaviorKind: "healing",
    automationTags: ["healing", "bonus_action", "multi_target"],
  },
  {
    slug: "revivify",
    status: "ready",
    behaviorKind: "healing",
    automationTags: ["healing", "revival"],
  },
  {
    slug: "bless",
    status: "ready",
    behaviorKind: "buff",
    automationTags: ["concentration", "buff", "multi_target"],
  },
  {
    slug: "bane",
    status: "ready",
    behaviorKind: "buff",
    automationTags: ["concentration", "debuff", "multi_target"],
  },
  {
    slug: "shield",
    status: "ready",
    behaviorKind: "buff",
    automationTags: ["reaction", "defense"],
  },
  {
    slug: "mage-armor",
    status: "ready",
    behaviorKind: "buff",
    automationTags: ["defense"],
  },
  {
    slug: "shield-of-faith",
    status: "ready",
    behaviorKind: "buff",
    automationTags: ["concentration", "defense", "bonus_action"],
  },
  {
    slug: "protection-from-evil-and-good",
    status: "ready",
    behaviorKind: "buff",
    automationTags: [
      "concentration",
      "defense",
      "condition_immunity",
      "creature_type",
    ],
  },
  {
    slug: "aid",
    status: "ready",
    behaviorKind: "buff",
    automationTags: ["buff", "multi_target", "hit_points"],
  },
  {
    slug: "poison-spray",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["cantrip", "damage", "save"],
  },
  {
    slug: "chill-touch",
    status: "ready",
    behaviorKind: "attack_damage",
    automationTags: ["cantrip", "damage", "ranged"],
  },
  {
    slug: "command",
    status: "ready",
    behaviorKind: "condition",
    automationTags: ["control", "save"],
  },
  {
    slug: "hold-person",
    status: "ready",
    behaviorKind: "condition",
    automationTags: ["concentration", "control", "save"],
  },
  {
    slug: "blindness-deafness",
    status: "ready",
    behaviorKind: "condition",
    automationTags: ["control", "save"],
  },
  {
    slug: "sleep",
    status: "ready",
    behaviorKind: "condition",
    automationTags: ["control"],
  },
  {
    slug: "suggestion",
    status: "ready",
    behaviorKind: "condition",
    automationTags: ["concentration", "control", "save"],
  },
  {
    slug: "fear",
    status: "ready",
    behaviorKind: "condition",
    automationTags: ["concentration", "control", "aoe"],
  },
  {
    slug: "hypnotic-pattern",
    status: "ready",
    behaviorKind: "condition",
    automationTags: ["concentration", "control", "aoe"],
  },
  {
    slug: "banishment",
    status: "ready",
    behaviorKind: "condition",
    automationTags: ["concentration", "control", "save"],
  },
  {
    slug: "hold-monster",
    status: "ready",
    behaviorKind: "condition",
    automationTags: ["concentration", "control", "save"],
  },
  {
    slug: "hex",
    status: "ready",
    behaviorKind: "mark",
    automationTags: ["concentration", "mark", "damage_rider"],
  },
  {
    slug: "hunters-mark",
    status: "ready",
    behaviorKind: "mark",
    automationTags: ["concentration", "mark", "damage_rider"],
  },
  {
    slug: "fireball",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["damage", "aoe"],
  },
  {
    slug: "lightning-bolt",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["damage", "aoe"],
  },
  {
    slug: "shatter",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["damage", "aoe"],
  },
  {
    slug: "cone-of-cold",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["damage", "aoe"],
  },
  {
    slug: "flame-strike",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["damage", "aoe"],
  },
  {
    slug: "disintegrate",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["damage", "save"],
  },
  {
    slug: "chain-lightning",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["damage", "multi_target"],
  },
  {
    slug: "thunderclap",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["cantrip", "damage", "aoe"],
  },
  {
    slug: "witch-bolt",
    status: "ready",
    behaviorKind: "attack_damage",
    automationTags: ["concentration", "damage", "ranged"],
  },
  {
    slug: "inflict-wounds",
    status: "ready",
    behaviorKind: "attack_damage",
    automationTags: ["damage", "melee"],
  },
  {
    slug: "chromatic-orb",
    status: "ready",
    behaviorKind: "attack_damage",
    automationTags: ["damage", "ranged"],
  },
  {
    slug: "scorching-ray",
    status: "ready",
    behaviorKind: "attack_damage",
    automationTags: ["damage", "multi_target"],
  },
  {
    slug: "melfs-acid-arrow",
    status: "ready",
    behaviorKind: "attack_damage",
    automationTags: ["damage", "ranged"],
  },
  {
    slug: "call-lightning",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["concentration", "damage", "aoe"],
  },
  {
    slug: "heal",
    status: "ready",
    behaviorKind: "healing",
    automationTags: ["healing", "condition_removal"],
  },
  {
    slug: "fire-storm",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["damage", "aoe", "multi_cube"],
  },
  {
    slug: "sunburst",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["damage", "aoe", "control", "blinded"],
  },
  {
    slug: "storm-of-vengeance",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: [
      "concentration",
      "damage",
      "aoe",
      "control",
      "multi_round",
    ],
  },
  {
    slug: "blight",
    status: "ready",
    behaviorKind: "save_damage",
    automationTags: ["damage", "save"],
  },
  {
    slug: "prayer-of-healing",
    status: "ready",
    behaviorKind: "healing",
    automationTags: ["healing", "multi_target"],
  },
  {
    slug: "fog-cloud",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: ["concentration", "area", "obscurement"],
  },
  {
    slug: "zone-of-truth",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: ["area", "control", "charisma_save", "no_concentration"],
  },
  {
    slug: "grease",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: ["concentration", "area", "control"],
  },
  {
    slug: "web",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: ["concentration", "area", "control"],
  },
  {
    slug: "spike-growth",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: ["concentration", "area", "damage", "terrain"],
  },
  {
    slug: "wall-of-fire",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: ["concentration", "area", "damage", "wall"],
  },
  {
    slug: "cloud-of-daggers",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: ["concentration", "area", "damage"],
  },
  {
    slug: "sleet-storm",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: ["concentration", "area", "control", "obscurement"],
  },
  {
    slug: "spirit-guardians",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: ["concentration", "aura", "damage"],
  },
  {
    slug: "summon-beast",
    status: "ready",
    behaviorKind: "summon",
    automationTags: ["concentration", "summon", "controlled_token"],
  },
  {
    slug: "conjure-animals",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: [
      "concentration",
      "area",
      "damage",
      "movable",
      "strength_save_advantage",
    ],
  },
  {
    slug: "conjure-woodland-beings",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: ["concentration", "aura", "damage", "bonus_action"],
  },
  {
    slug: "conjure-elemental",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: [
      "concentration",
      "area",
      "damage",
      "control",
      "restrained",
      "stationary",
      "element_choice",
    ],
  },
  {
    slug: "summon-elemental",
    status: "ready",
    behaviorKind: "summon",
    automationTags: ["concentration", "summon", "controlled_token"],
  },
  {
    slug: "find-familiar",
    status: "ready",
    behaviorKind: "summon",
    automationTags: ["summon", "controlled_token", "familiar"],
  },
  {
    slug: "spiritual-weapon",
    status: "ready",
    behaviorKind: "persistent_area",
    automationTags: [
      "persistent_effect",
      "movable",
      "spell_attack",
      "bonus_action",
      "no_concentration",
    ],
  },
  {
    slug: "fly",
    status: "ready",
    behaviorKind: "buff",
    automationTags: ["concentration", "mobility"],
  },
  {
    slug: "haste",
    status: "ready",
    behaviorKind: "buff",
    automationTags: ["concentration", "mobility", "action_economy"],
  },
  {
    slug: "greater-invisibility",
    status: "ready",
    behaviorKind: "buff",
    automationTags: ["concentration", "stealth", "offense"],
  },
];

const SPELL_AUTOMATION_BY_SLUG = new Map(
  SPELL_AUTOMATION_ENTRIES.map((entry) => [entry.slug, entry]),
);

export const READY_SPELL_AUTOMATION_SLUGS = new Set(
  SPELL_AUTOMATION_ENTRIES.map((entry) => entry.slug),
);

export function normalizeSpellAutomationSlug(spellSlug: string): string {
  return spellSlug.trim().toLowerCase().replace(/-(phb|xphb|srd52)$/, "");
}

export function getSpellAutomationEntry(
  spellSlug: string,
): SpellAutomationEntry | null {
  return (
    SPELL_AUTOMATION_BY_SLUG.get(normalizeSpellAutomationSlug(spellSlug)) ??
    null
  );
}

export function isSpellAutomationReady(spellSlug: string): boolean {
  return getSpellAutomationEntry(spellSlug)?.status === "ready";
}
