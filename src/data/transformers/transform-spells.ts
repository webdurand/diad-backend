import * as fs from "fs";
import * as path from "path";
import { generateSlug } from "./slug-generator";
import { parseEntries } from "./entries-parser";
import { stripTags } from "./tag-stripper";
import { SPELL_SCHOOL_MAP } from "./code-maps";





interface FiveToolsSpell {
  name: string;
  source: string;
  page?: number;
  srd52?: boolean;
  basicRules2024?: boolean;
  level: number;
  school: string;
  time: { number: number; unit: string; condition?: string }[];
  range: {
    type: string;
    distance?: { type: string; amount?: number };
  };
  components: {
    v?: boolean;
    s?: boolean;
    m?: string | boolean | { text: string; cost?: number; consume?: boolean };
  };
  duration: {
    type: string;
    duration?: { type: string; amount: number };
    concentration?: boolean;
    ends?: string[];
  }[];
  meta?: { ritual?: boolean };
  entries?: unknown[];
  entriesHigherLevel?: unknown[];
  damageInflict?: string[];
  savingThrow?: string[];
  areaTags?: string[];
  miscTags?: string[];
  scalingLevelDice?: ScalingLevelDice | ScalingLevelDice[];
  conditionInflict?: string[];
  affectsCreatureType?: string[];
  spellAttack?: string[];
  _copy?: unknown;
  [key: string]: unknown;
}

interface ScalingLevelDice {
  label?: string;
  scaling: Record<string, string>;
}

interface SpellSourceEntry {
  class?: { name: string; source: string }[];
  subclass?: {
    name: string;
    source: string;
    subSubclass?: string;
    class: { name: string; source: string };
  }[];
}





export interface TransformedSpell {
  slug: string;
  name: string;
  description: string[];
  higher_level: string[] | null;
  range: string;
  components: string[];
  material: string | null;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  casting_time: string;
  level: number;
  attack_type: "melee" | "ranged" | null;
  damage: Record<string, unknown> | null;
  dc: Record<string, unknown> | null;
  heal_at_slot_level: Record<string, unknown> | null;
  area_of_effect: Record<string, unknown> | null;
  school_slug: string | null;
  source_code: string;
  raw: Record<string, unknown>;
}

export interface SpellClassMapping {
  spell_slug: string;
  class_slug: string;
}





const AREA_TAG_MAP: Record<string, string> = {
  S: "sphere",
  N: "cone",
  L: "line",
  R: "cube",
  Q: "square",
  Y: "cylinder",
  H: "hemisphere",
  W: "wall",
  MT: "multiple targets",
  ST: "single target",
};





function convertRange(range: FiveToolsSpell["range"]): string {
  if (!range) return "Self";

  const distance = range.distance;
  if (!distance) return "Special";

  switch (distance.type) {
    case "self":
      return "Self";
    case "touch":
      return "Touch";
    case "sight":
      return "Sight";
    case "unlimited":
      return "Unlimited";
    case "feet":
      if (range.type !== "point" && distance.amount) {
        return "Self";
      }
      return distance.amount ? `${distance.amount} feet` : "Self";
    case "miles":
      return distance.amount
        ? `${distance.amount} mile${distance.amount > 1 ? "s" : ""}`
        : "Special";
    default:
      return "Special";
  }
}

function convertDuration(duration: FiveToolsSpell["duration"]): {
  text: string;
  concentration: boolean;
} {
  if (!duration || !duration[0])
    return { text: "Instantaneous", concentration: false };

  const d = duration[0];
  const concentration = d.concentration ?? false;

  switch (d.type) {
    case "instant":
      return { text: "Instantaneous", concentration };
    case "timed": {
      if (!d.duration) return { text: "Special", concentration };
      const amount = d.duration.amount;
      const unit = d.duration.type;
      const prefix = concentration ? "Concentration, up to " : "";
      return {
        text: `${prefix}${amount} ${unit}${amount > 1 ? "s" : ""}`,
        concentration,
      };
    }
    case "permanent": {
      const ends = d.ends ?? [];
      if (ends.includes("dispel") && ends.includes("trigger")) {
        return { text: "Until dispelled or triggered", concentration };
      }
      if (ends.includes("dispel"))
        return { text: "Until dispelled", concentration };
      if (ends.includes("trigger"))
        return { text: "Until triggered", concentration };
      return { text: "Permanent", concentration };
    }
    case "special":
      return { text: "Special", concentration };
    default:
      return { text: "Special", concentration };
  }
}

function convertCastingTime(time: FiveToolsSpell["time"]): string {
  if (!time || !time[0]) return "1 action";
  const t = time[0];
  const base = `${t.number} ${t.unit}${t.number > 1 ? "s" : ""}`;
  if (t.condition) {
    return `${base}, ${stripTags(t.condition)}`;
  }
  return base;
}

function convertComponents(comp: FiveToolsSpell["components"]): {
  components: string[];
  material: string | null;
} {
  if (!comp) return { components: [], material: null };

  const components: string[] = [];
  if (comp.v) components.push("V");
  if (comp.s) components.push("S");
  if (comp.m) components.push("M");

  let material: string | null = null;
  if (typeof comp.m === "string") {
    material = comp.m;
  } else if (
    typeof comp.m === "object" &&
    comp.m !== null &&
    "text" in comp.m
  ) {
    material = (comp.m as { text: string }).text;
  }

  return { components, material };
}

function convertDamage(spell: FiveToolsSpell): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  let hasData = false;

  if (spell.damageInflict && spell.damageInflict.length > 0) {
    result.damage_type = spell.damageInflict;
    hasData = true;
  }

  const scaling = spell.scalingLevelDice;
  if (scaling) {
    const dice = Array.isArray(scaling) ? scaling[0] : scaling;
    if (dice?.scaling) {
      result.damage_at_character_level = dice.scaling;
      hasData = true;
    }
  }

  return hasData ? result : null;
}

function convertDc(spell: FiveToolsSpell): Record<string, unknown> | null {
  if (!spell.savingThrow || spell.savingThrow.length === 0) return null;
  return {
    dc_type: spell.savingThrow,
    dc_success: "half",
  };
}

function convertAreaOfEffect(
  spell: FiveToolsSpell,
): Record<string, unknown> | null {
  if (!spell.areaTags || spell.areaTags.length === 0) return null;

  const tags = spell.areaTags.map((t) => AREA_TAG_MAP[t] ?? t).filter(Boolean);

  if (tags.length === 0) return null;


  const range = spell.range;
  if (range && range.type !== "point" && range.distance?.amount) {
    return {
      type: AREA_TAG_MAP[range.type?.charAt(0)?.toUpperCase()] ?? tags[0],
      size: range.distance.amount,
      tags,
    };
  }

  return { tags };
}

function detectAttackType(spell: FiveToolsSpell): "melee" | "ranged" | null {
  if (spell.spellAttack) {
    if (spell.spellAttack.includes("M")) return "melee";
    if (spell.spellAttack.includes("R")) return "ranged";
  }
  return null;
}





const SPELLS_DIR = path.resolve(
  __dirname,
  "../../../../5etools-src/data/spells",
);

function loadSpellFiles(): FiveToolsSpell[] {
  const spells: FiveToolsSpell[] = [];

  const files = fs
    .readdirSync(SPELLS_DIR)
    .filter((f) => f.startsWith("spells-") && f.endsWith(".json"));

  for (const file of files) {
    const filePath = path.join(SPELLS_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const entries: FiveToolsSpell[] = data.spell ?? [];
    spells.push(...entries.filter((s) => !s._copy));
  }

  return spells;
}

function transformOneSpell(spell: FiveToolsSpell): TransformedSpell {
  const slug = generateSlug(spell.name, spell.source, spell.srd52);
  const { text: duration, concentration } = convertDuration(spell.duration);
  const { components, material } = convertComponents(spell.components);

  const description = spell.entries ? parseEntries(spell.entries as any[]) : [];
  const higherLevel = spell.entriesHigherLevel
    ? parseEntries(spell.entriesHigherLevel as any[])
    : null;

  const schoolSlug = SPELL_SCHOOL_MAP[spell.school] ?? null;

  return {
    slug,
    name: spell.name,
    description,
    higher_level: higherLevel && higherLevel.length > 0 ? higherLevel : null,
    range: convertRange(spell.range),
    components,
    material,
    ritual: spell.meta?.ritual ?? false,
    duration,
    concentration,
    casting_time: convertCastingTime(spell.time),
    level: spell.level,
    attack_type: detectAttackType(spell),
    damage: convertDamage(spell),
    dc: convertDc(spell),
    heal_at_slot_level: null,
    area_of_effect: convertAreaOfEffect(spell),
    school_slug: schoolSlug,
    source_code: spell.source,
    raw: spell as unknown as Record<string, unknown>,
  };
}

export function transformSpells(): TransformedSpell[] {
  const raw = loadSpellFiles();
  return raw.map(transformOneSpell);
}





export function loadSpellClassMappings(): SpellClassMapping[] {
  const filePath = path.join(SPELLS_DIR, "sources.json");
  if (!fs.existsSync(filePath)) return [];

  const data: Record<string, Record<string, SpellSourceEntry>> = JSON.parse(
    fs.readFileSync(filePath, "utf-8"),
  );

  const mappings: SpellClassMapping[] = [];
  const seen = new Set<string>();

  for (const [sourceCode, spellMap] of Object.entries(data)) {
    for (const [spellName, entry] of Object.entries(spellMap)) {
      const spellSlug = generateSlug(
        spellName,
        sourceCode,
        sourceCode === "XPHB",
      );

      if (!entry.class) continue;

      for (const cls of entry.class) {
        const classSlug = generateSlug(
          cls.name,
          cls.source,
          cls.source === "XPHB",
        );
        const key = `${spellSlug}::${classSlug}`;
        if (seen.has(key)) continue;
        seen.add(key);

        mappings.push({ spell_slug: spellSlug, class_slug: classSlug });
      }
    }
  }

  return mappings;
}
