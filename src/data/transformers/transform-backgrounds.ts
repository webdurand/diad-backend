import * as fs from "fs";
import * as path from "path";
import { generateSlug } from "./slug-generator";
import { parseEntriesAsText } from "./entries-parser";
import { ABILITY_MAP } from "./code-maps";
import { stripTags } from "./tag-stripper";

interface FiveToolsBackground {
  name: string;
  source: string;
  page?: number;
  srd52?: boolean;
  edition?: string;
  ability?: Record<string, unknown>[];
  feats?: Record<string, boolean>[];
  skillProficiencies?: Record<string, unknown>[];
  toolProficiencies?: Record<string, unknown>[];
  languageProficiencies?: Record<string, unknown>[];
  startingEquipment?: Record<string, unknown>[];
  entries?: unknown[];
  _copy?: { name: string; source: string; _mod?: Record<string, unknown> };
  reprintedAs?: unknown;
  [key: string]: unknown;
}

const INHERITABLE_FIELDS = [
  "skillProficiencies",
  "toolProficiencies",
  "languageProficiencies",
  "startingEquipment",
  "entries",
  "ability",
  "feats",
] as const;

function resolveCopy(
  bg: FiveToolsBackground,
  allBackgrounds: FiveToolsBackground[],
): FiveToolsBackground {
  if (!bg._copy) return bg;

  const parent = allBackgrounds.find(
    (p) => p.name === bg._copy!.name && p.source === bg._copy!.source,
  );
  if (!parent) return bg;

  const resolved = { ...bg };
  for (const field of INHERITABLE_FIELDS) {
    if (resolved[field] == null && parent[field] != null) {
      resolved[field] = structuredClone(parent[field]) as any;
    }
  }

  // Apply _mod.entries replacements if present
  if (bg._copy._mod?.entries && resolved.entries) {
    const mods = Array.isArray(bg._copy._mod.entries)
      ? bg._copy._mod.entries
      : [bg._copy._mod.entries];

    for (const mod of mods as Record<string, unknown>[]) {
      if (mod.mode === "replaceArr" && mod.replace && mod.items) {
        const idx = resolved.entries.findIndex((e: any) => {
          if (typeof e === "object" && e !== null && "name" in e) {
            return (e as { name: string }).name === mod.replace;
          }
          return false;
        });
        if (idx !== -1) {
          resolved.entries.splice(idx, 1, mod.items as unknown);
        }
      } else if (mod.mode === "insertArr" && mod.items != null) {
        const insertIdx = (mod.index as number) ?? resolved.entries.length;
        resolved.entries.splice(insertIdx, 0, mod.items as unknown);
      }
    }
  }

  return resolved;
}

export interface AbilityScoreOption {
  slug: string;
  name: string;
}

export interface AbilityScoreConfig {
  abilities: AbilityScoreOption[];
  options: { weights: number[] }[];
}

export interface TransformedBackground {
  slug: string;
  name: string;
  ability_scores: AbilityScoreConfig | null;
  feat_slug: string | null;
  skill_proficiency_slugs: string[];
  tool_proficiency_slugs: string[];
  language_choices: Record<string, unknown> | null;
  equipment_options: Record<string, unknown>;
  feature: { name: string; description: string } | null;
  source_code: string;
  raw: Record<string, unknown>;
}

const ABILITY_NAMES: Record<string, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

function convertAbilityScores(
  abilityArr?: Record<string, unknown>[],
): AbilityScoreConfig | null {
  if (!abilityArr?.length) return null;

  const abilities: AbilityScoreOption[] = [];
  const options: { weights: number[] }[] = [];

  for (const entry of abilityArr) {
    const choose = entry.choose as
      | { weighted?: { from: string[]; weights: number[] } }
      | undefined;

    if (choose?.weighted) {
      const { from, weights } = choose.weighted;

      if (!abilities.length) {
        for (const abbr of from) {
          const fullSlug = ABILITY_MAP[abbr] ?? abbr;
          abilities.push({
            slug: fullSlug,
            name: ABILITY_NAMES[abbr] ?? abbr.toUpperCase(),
          });
        }
      }
      options.push({ weights });
    }
  }

  if (!abilities.length) return null;

  return { abilities, options };
}

function parseFeatReference(feats?: Record<string, boolean>[]): string | null {
  if (!feats?.length) return null;

  const first = feats[0];
  const key = Object.keys(first)[0];
  if (!key) return null;

  // Format: "feat name|source" or "feat name; variant|source"
  const [nameWithVariant, source] = key.split("|");
  if (!nameWithVariant || !source) return null;

  // Remove variant info (e.g., "magic initiate; cleric" -> "magic initiate")
  const baseName = nameWithVariant.split(";")[0].trim();
  return generateSlug(baseName, source);
}

function normalizeSkillSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function convertSkillProficiencies(
  skillProfs?: Record<string, unknown>[],
): string[] {
  if (!skillProfs?.length) return [];

  const slugs: string[] = [];
  for (const entry of skillProfs) {
    for (const [key, value] of Object.entries(entry)) {
      if (key === "choose") continue;
      if (value === true) {
        slugs.push(`skill-${normalizeSkillSlug(key)}`);
      }
    }
  }
  return slugs;
}

function convertToolProficiencies(
  toolProfs?: Record<string, unknown>[],
): string[] {
  if (!toolProfs?.length) return [];

  const slugs: string[] = [];
  for (const entry of toolProfs) {
    for (const [key, value] of Object.entries(entry)) {
      if (key === "choose" || key === "anyArtisansTool") continue;
      if (value === true) {
        slugs.push(normalizeSkillSlug(key));
      }
    }
  }
  return slugs;
}

function convertLanguageChoices(
  langProfs?: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (!langProfs?.length) return null;

  const entry = langProfs[0];
  if (entry.anyStandard) {
    return { choose: entry.anyStandard, type: "standard" };
  }

  const fixed: string[] = [];
  for (const [key, value] of Object.entries(entry)) {
    if (value === true) fixed.push(key);
  }
  if (fixed.length) return { fixed };

  return null;
}

function convertEquipment(
  equip?: Record<string, unknown>[],
): Record<string, unknown> {
  if (!equip?.length) return {};

  const entry = equip[0];

  // 2024 format: { A: [...], B: [...] }
  // Classic format: { _: [...] } or { a: [...], b: [...] }
  const groups: Record<string, unknown[]> = {};

  for (const [key, items] of Object.entries(entry)) {
    if (!Array.isArray(items)) continue;

    groups[key.toUpperCase()] = items.map((item: unknown) => {
      if (typeof item === "string") {
        const [name, source] = item.split("|");
        return { name: stripTags(name), source: source ?? "" };
      }

      const obj = item as Record<string, unknown>;
      if (obj.value) {
        return { gold: (obj.value as number) / 100 };
      }
      if (obj.special) {
        return {
          name: stripTags(obj.special as string),
          quantity: obj.quantity ?? 1,
        };
      }
      if (obj.item) {
        const [name, source] = (obj.item as string).split("|");
        return {
          name: obj.displayName
            ? stripTags(obj.displayName as string)
            : stripTags(name),
          source: source ?? "",
          quantity: obj.quantity ?? 1,
        };
      }
      return obj;
    });
  }

  return groups;
}

function extractFeature(
  entries?: unknown[],
): { name: string; description: string } | null {
  if (!entries?.length) return null;

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const obj = entry as { type?: string; name?: string; entries?: unknown[] };

    if (
      obj.type === "entries" &&
      obj.name &&
      typeof obj.name === "string" &&
      obj.name.startsWith("Feature:")
    ) {
      return {
        name: stripTags(obj.name),
        description: obj.entries
          ? parseEntriesAsText(obj.entries as any[])
          : "",
      };
    }
  }

  return null;
}

export function transformBackgrounds(): TransformedBackground[] {
  const filePath = path.resolve(
    process.cwd(),
    "../5etools-src/data/backgrounds.json",
  );
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const backgrounds: FiveToolsBackground[] = data.background ?? [];

  return backgrounds
    .filter((b) => !b.reprintedAs)
    .map((b) => resolveCopy(b, backgrounds))
    .map((b) => ({
      slug: generateSlug(b.name, b.source, b.srd52),
      name: b.name,
      ability_scores: convertAbilityScores(b.ability),
      feat_slug: parseFeatReference(b.feats),
      skill_proficiency_slugs: convertSkillProficiencies(b.skillProficiencies),
      tool_proficiency_slugs: convertToolProficiencies(b.toolProficiencies),
      language_choices: convertLanguageChoices(b.languageProficiencies),
      equipment_options: convertEquipment(b.startingEquipment),
      feature: extractFeature(b.entries),
      source_code: b.source,
      raw: b as Record<string, unknown>,
    }));
}
