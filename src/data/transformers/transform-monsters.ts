import * as fs from "fs";
import * as path from "path";
import { generateSlug } from "./slug-generator";
import { parseEntries } from "./entries-parser";
import { stripTags } from "./tag-stripper";
import { SIZE_MAP, ALIGNMENT_MAP } from "./code-maps";

// ────────────────────────────────────────────────────────────────
// CR → XP lookup
// ────────────────────────────────────────────────────────────────

const CR_XP_MAP: Record<string, number> = {
  "0": 10,
  "1/8": 25,
  "1/4": 50,
  "1/2": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
  "21": 33000,
  "22": 41000,
  "23": 50000,
  "24": 62000,
  "25": 75000,
  "26": 90000,
  "27": 105000,
  "28": 120000,
  "29": 135000,
  "30": 155000,
};

// CR → Proficiency Bonus
const CR_PROF_BONUS: Record<string, number> = {
  "0": 2,
  "1/8": 2,
  "1/4": 2,
  "1/2": 2,
  "1": 2,
  "2": 2,
  "3": 2,
  "4": 2,
  "5": 3,
  "6": 3,
  "7": 3,
  "8": 3,
  "9": 4,
  "10": 4,
  "11": 4,
  "12": 4,
  "13": 5,
  "14": 5,
  "15": 5,
  "16": 5,
  "17": 6,
  "18": 6,
  "19": 6,
  "20": 6,
  "21": 7,
  "22": 7,
  "23": 7,
  "24": 7,
  "25": 8,
  "26": 8,
  "27": 8,
  "28": 8,
  "29": 9,
  "30": 9,
};

// ────────────────────────────────────────────────────────────────
// 5etools input types
// ────────────────────────────────────────────────────────────────

interface FiveToolsMonster {
  name: string;
  source: string;
  page?: number;
  srd?: boolean;
  srd52?: boolean;
  size?: string[];
  type?:
    | string
    | { type: string; tags?: (string | { tag: string; prefix?: string })[] };
  alignment?: string[];
  ac?: (number | { ac?: number; from?: string[]; special?: string })[];
  hp?: { average?: number; formula?: string; special?: string };
  speed?: Record<string, unknown>;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  save?: Record<string, string>;
  skill?: Record<string, string>;
  senses?: string[];
  passive?: number;
  languages?: string[];
  cr?: string | { cr: string; lair?: string; coven?: string };
  immune?: (string | { immune: string[]; note?: string; cond?: boolean })[];
  resist?: (
    | string
    | { resist: string[]; note?: string; cond?: boolean; preNote?: string }
  )[];
  vulnerable?: (
    | string
    | { vulnerable: string[]; note?: string; cond?: boolean }
  )[];
  conditionImmune?: (string | { conditionImmune: string[]; note?: string })[];
  trait?: { name: string; entries: unknown[] }[];
  action?: { name: string; entries: unknown[] }[];
  legendary?: { name: string; entries: unknown[] }[];
  reaction?: { name: string; entries: unknown[] }[];
  spellcasting?: {
    name: string;
    type?: string;
    ability?: string;
    headerEntries?: unknown[];
    footerEntries?: unknown[];
    will?: unknown[];
    daily?: Record<string, unknown[]>;
    spells?: Record<string, { spells: string[]; slots?: number }>;
    displayAs?: string;
  }[];
  legendaryGroup?: { name: string; source: string };
  environment?: string[];
  hasToken?: boolean;
  hasFluff?: boolean;
  hasFluffImages?: boolean;
  _copy?: unknown;
  _versions?: unknown[];
  summonedBySpell?: string;
  summonedBySpellLevel?: number;
  [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────
// Output type
// ────────────────────────────────────────────────────────────────

export interface TransformedMonster {
  slug: string;
  name: string;
  size: string;
  type: string;
  subtype: string | null;
  alignment: string;
  armor_class: unknown;
  hit_points: number;
  hit_dice: string;
  hit_points_roll: string;
  speed: Record<string, unknown>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  proficiencies: unknown;
  damage_vulnerabilities: unknown;
  damage_resistances: unknown;
  damage_immunities: unknown;
  condition_immunities: unknown;
  senses: unknown;
  languages: string;
  proficiency_bonus: number;
  xp: number;
  special_abilities: unknown | null;
  actions: unknown | null;
  legendary_actions: unknown | null;
  reactions: unknown | null;
  image: string | null;
  description: string | null;
  challenge_rating: number;
  source_code: string;
  raw: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────
// Conversion helpers
// ────────────────────────────────────────────────────────────────

function convertSize(size?: string[]): string {
  if (!size || size.length === 0) return "Medium";
  return SIZE_MAP[size[0]] ?? size[0];
}

function convertType(type?: FiveToolsMonster["type"]): {
  type: string;
  subtype: string | null;
} {
  if (!type) return { type: "unknown", subtype: null };
  if (typeof type === "string") return { type, subtype: null };
  const tags = type.tags ?? [];
  const subtypeParts = tags.map((t) => (typeof t === "string" ? t : t.tag));
  return {
    type: type.type,
    subtype: subtypeParts.length > 0 ? subtypeParts.join(", ") : null,
  };
}

function convertAlignment(alignment?: unknown[]): string {
  if (!alignment || alignment.length === 0) return "Unaligned";
  const parts: string[] = [];
  for (const a of alignment) {
    if (typeof a === "string") {
      parts.push(ALIGNMENT_MAP[a] ?? a);
    } else if (typeof a === "object" && a !== null) {
      const obj = a as Record<string, unknown>;
      if (obj.special) {
        return String(obj.special);
      }
      if (Array.isArray(obj.alignment)) {
        const sub = obj.alignment.map((s: string) => ALIGNMENT_MAP[s] ?? s);
        parts.push(...sub);
      }
    }
  }
  if (parts.length === 0) return "Unaligned";
  if (parts.length === 1 && parts[0] === "any") return "Any Alignment";
  if (parts.length === 1 && parts[0] === "unaligned") return "Unaligned";
  return parts
    .map((p) =>
      typeof p === "string" && p.length > 0
        ? p.charAt(0).toUpperCase() + p.slice(1)
        : p,
    )
    .join(" ");
}

function convertAc(ac?: FiveToolsMonster["ac"]): unknown {
  if (!ac || ac.length === 0) return [{ value: 10 }];
  return ac.map((entry) => {
    if (typeof entry === "number") return { value: entry };
    if (entry.special) return { value: 0, note: stripTags(entry.special) };
    return {
      value: entry.ac ?? 0,
      ...(entry.from ? { from: entry.from.map(stripTags) } : {}),
    };
  });
}

function convertHp(hp?: FiveToolsMonster["hp"]): {
  hit_points: number;
  hit_dice: string;
  hit_points_roll: string;
} {
  if (!hp) return { hit_points: 0, hit_dice: "", hit_points_roll: "" };
  if (hp.special) {
    return {
      hit_points: 0,
      hit_dice: "",
      hit_points_roll: stripTags(hp.special),
    };
  }
  const formula = hp.formula ?? "";
  // Extract dice portion (e.g. "18d10" from "18d10 + 36")
  const diceMatch = formula.match(/^\d+d\d+/);
  return {
    hit_points: hp.average ?? 0,
    hit_dice: diceMatch ? diceMatch[0] : formula,
    hit_points_roll: formula,
  };
}

function convertSpeed(
  speed?: Record<string, unknown>,
): Record<string, unknown> {
  if (!speed) return {};
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(speed)) {
    if (key === "canHover") {
      result.canHover = true;
      continue;
    }
    if (typeof val === "number") {
      result[key] = val;
    } else if (typeof val === "object" && val !== null) {
      const obj = val as Record<string, unknown>;
      result[key] = obj.number ?? obj;
      if (obj.condition) {
        result[`${key}Note`] = stripTags(String(obj.condition));
      }
    } else if (typeof val === "boolean") {
      result[key] = val;
    }
  }
  return result;
}

function convertCr(cr?: FiveToolsMonster["cr"]): {
  crString: string;
  crNumeric: number;
  xp: number;
  profBonus: number;
} {
  if (!cr) return { crString: "0", crNumeric: 0, xp: 10, profBonus: 2 };
  const crStr = typeof cr === "string" ? cr : cr.cr;
  let crNumeric: number;
  if (crStr.includes("/")) {
    const [num, den] = crStr.split("/").map(Number);
    crNumeric = num / den;
  } else {
    crNumeric = Number(crStr);
  }
  return {
    crString: crStr,
    crNumeric,
    xp: CR_XP_MAP[crStr] ?? 0,
    profBonus: CR_PROF_BONUS[crStr] ?? 2,
  };
}

function convertProficiencies(
  saves?: Record<string, string>,
  skills?: Record<string, string>,
): unknown {
  const result: { type: string; name: string; value: string }[] = [];
  if (saves) {
    for (const [ability, bonus] of Object.entries(saves)) {
      result.push({ type: "saving-throw", name: ability, value: bonus });
    }
  }
  if (skills) {
    for (const [skill, bonus] of Object.entries(skills)) {
      result.push({ type: "skill", name: skill, value: bonus });
    }
  }
  return result;
}

function convertDamageList(
  list?: (
    | string
    | {
        immune?: string[];
        resist?: string[];
        vulnerable?: string[];
        note?: string;
        preNote?: string;
        cond?: boolean;
      }
  )[],
  key?: string,
): unknown {
  if (!list || list.length === 0) return [];
  return list.map((entry) => {
    if (typeof entry === "string") return entry;
    const items =
      (entry as any)[key ?? "immune"] ??
      (entry as any).resist ??
      (entry as any).vulnerable ??
      [];
    const note = entry.note ? ` (${stripTags(entry.note)})` : "";
    const preNote = (entry as any).preNote
      ? `${stripTags((entry as any).preNote)} `
      : "";
    return `${preNote}${items.join(", ")}${note}`;
  });
}

function convertConditionImmunities(
  list?: (string | { conditionImmune: string[]; note?: string })[],
): unknown {
  if (!list || list.length === 0) return [];
  return list.map((entry) => {
    if (typeof entry === "string") return entry;
    const note = entry.note ? ` (${stripTags(entry.note)})` : "";
    return `${entry.conditionImmune.join(", ")}${note}`;
  });
}

function convertSenses(senses?: string[], passive?: number): unknown {
  const result: Record<string, unknown> = {};
  if (senses) {
    result.values = senses.map(stripTags);
  }
  if (passive !== undefined && passive !== null) {
    result.passive_perception = passive;
  }
  return result;
}

function convertEntryBlock(
  entries?: { name: string; entries: unknown[] }[],
): unknown | null {
  if (!entries || entries.length === 0) return null;
  return entries.map((entry) => ({
    name: entry.name,
    desc: parseEntries(entry.entries as any[]).join("\n"),
  }));
}

function convertSpellcasting(
  spellcasting?: FiveToolsMonster["spellcasting"],
): { name: string; desc: string }[] | null {
  if (!spellcasting || spellcasting.length === 0) return null;
  return spellcasting.map((sc) => {
    const parts: string[] = [];

    if (sc.headerEntries) {
      parts.push(...parseEntries(sc.headerEntries as any[]));
    }

    if (sc.will && sc.will.length > 0) {
      const spells = sc.will.map((s) =>
        typeof s === "string" ? stripTags(s) : String(s),
      );
      parts.push(`At will: ${spells.join(", ")}`);
    }

    if (sc.daily) {
      for (const [freq, spells] of Object.entries(sc.daily)) {
        const names = spells.map((s) =>
          typeof s === "string" ? stripTags(s) : String(s),
        );
        const label = freq.endsWith("e")
          ? `${freq.charAt(0)}/day each`
          : `${freq.charAt(0)}/day`;
        parts.push(`${label}: ${names.join(", ")}`);
      }
    }

    if (sc.spells) {
      for (const [level, data] of Object.entries(sc.spells)) {
        const spellData = data as { spells: string[]; slots?: number };
        const names = spellData.spells.map(stripTags);
        const slotInfo =
          spellData.slots !== undefined ? ` (${spellData.slots} slots)` : "";
        const lvlLabel =
          level === "0"
            ? "Cantrips (at will)"
            : `${level}${ordinalSuffix(Number(level))} level${slotInfo}`;
        parts.push(`${lvlLabel}: ${names.join(", ")}`);
      }
    }

    if (sc.footerEntries) {
      parts.push(...parseEntries(sc.footerEntries as any[]));
    }

    return { name: sc.name, desc: parts.join("\n") };
  });
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ────────────────────────────────────────────────────────────────
// Main transformer
// ────────────────────────────────────────────────────────────────

const BESTIARY_DIR = path.resolve(
  __dirname,
  "../../../../5etools-src/data/bestiary",
);

function loadBestiaryFiles(): { file: string; monsters: FiveToolsMonster[] }[] {
  if (!fs.existsSync(BESTIARY_DIR)) return [];
  const files = fs
    .readdirSync(BESTIARY_DIR)
    .filter((f) => f.startsWith("bestiary-") && f.endsWith(".json"));

  return files.map((file) => {
    const filePath = path.join(BESTIARY_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const monsters: FiveToolsMonster[] = (data.monster ?? []).filter(
      (m: FiveToolsMonster) => !m._copy,
    );
    return { file, monsters };
  });
}

function transformOneMonster(monster: FiveToolsMonster): TransformedMonster {
  const slug = generateSlug(
    monster.name,
    monster.source,
    monster.srd52 ?? monster.srd,
  );
  const { type, subtype } = convertType(monster.type);
  const { hit_points, hit_dice, hit_points_roll } = convertHp(monster.hp);
  const { crNumeric, xp, profBonus } = convertCr(monster.cr);

  // Merge spellcasting into special_abilities
  const traits = convertEntryBlock(monster.trait) as
    | { name: string; desc: string }[]
    | null;
  const spellcastingAbilities = convertSpellcasting(monster.spellcasting);
  let specialAbilities: unknown | null = null;
  if (traits || spellcastingAbilities) {
    specialAbilities = [...(spellcastingAbilities ?? []), ...(traits ?? [])];
  }

  return {
    slug,
    name: monster.name,
    size: convertSize(monster.size),
    type,
    subtype,
    alignment: convertAlignment(monster.alignment),
    armor_class: convertAc(monster.ac),
    hit_points,
    hit_dice,
    hit_points_roll,
    speed: convertSpeed(monster.speed),
    strength: monster.str ?? 10,
    dexterity: monster.dex ?? 10,
    constitution: monster.con ?? 10,
    intelligence: monster.int ?? 10,
    wisdom: monster.wis ?? 10,
    charisma: monster.cha ?? 10,
    proficiencies: convertProficiencies(monster.save, monster.skill),
    damage_vulnerabilities: convertDamageList(monster.vulnerable, "vulnerable"),
    damage_resistances: convertDamageList(monster.resist, "resist"),
    damage_immunities: convertDamageList(monster.immune, "immune"),
    condition_immunities: convertConditionImmunities(monster.conditionImmune),
    senses: convertSenses(monster.senses, monster.passive),
    languages: (monster.languages ?? []).join(", "),
    proficiency_bonus: profBonus,
    xp,
    special_abilities: specialAbilities,
    actions: convertEntryBlock(monster.action),
    legendary_actions: convertEntryBlock(monster.legendary),
    reactions: convertEntryBlock(monster.reaction),
    image: null,
    description: null,
    challenge_rating: crNumeric,
    source_code: monster.source,
    raw: monster as unknown as Record<string, unknown>,
  };
}

export function transformMonstersByFile(): {
  file: string;
  monsters: TransformedMonster[];
}[] {
  const filesets = loadBestiaryFiles();
  const seen = new Set<string>();

  return filesets.map(({ file, monsters }) => {
    const transformed: TransformedMonster[] = [];
    for (const monster of monsters) {
      const t = transformOneMonster(monster);
      if (seen.has(t.slug)) continue;
      seen.add(t.slug);
      transformed.push(t);
    }
    return { file, monsters: transformed };
  });
}
