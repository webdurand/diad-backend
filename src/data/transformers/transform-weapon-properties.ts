import * as fs from "fs";
import * as path from "path";
import { generateSlug } from "./slug-generator";
import { parseEntriesAsText } from "./entries-parser";
import { WEAPON_PROPERTY_MAP } from "./code-maps";

interface FiveToolsItemProperty {
  abbreviation: string;
  source: string;
  srd52?: boolean;
  entries?: unknown[];
  [key: string]: unknown;
}

export interface TransformedWeaponProperty {
  slug: string;
  name: string;
  description: string;
  source_code: string;
  raw: Record<string, unknown>;
}

export interface TransformedWeaponMasteryProperty {
  slug: string;
  name: string;
  description: string;
  source_code: string;
  raw: Record<string, unknown>;
}

function extractName(entries: unknown[]): string {
  if (!entries?.length) return "";
  const first = entries[0];
  if (typeof first === "object" && first !== null && "name" in first) {
    return (first as { name: string }).name;
  }
  return "";
}

export function transformWeaponProperties(): TransformedWeaponProperty[] {
  const filePath = path.resolve(
    process.cwd(),
    "../5etools-src/data/items-base.json",
  );
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const props: FiveToolsItemProperty[] = data.itemProperty ?? [];

  // Deduplicate: prefer XPHB version
  const seen = new Map<string, TransformedWeaponProperty>();

  for (const p of props) {
    const abbr = p.abbreviation;
    const slugBase = WEAPON_PROPERTY_MAP[abbr];

    // Skip properties not in WEAPON_PROPERTY_MAP (e.g., Burst Fire, Vestige)
    if (!slugBase) continue;

    const name = extractName(p.entries as unknown[]) || slugBase;
    const description = p.entries ? parseEntriesAsText(p.entries as any[]) : "";

    // Prefer XPHB source
    if (!seen.has(slugBase) || p.source === "XPHB") {
      seen.set(slugBase, {
        slug: slugBase,
        name,
        description,
        source_code: p.source,
        raw: p as Record<string, unknown>,
      });
    }
  }

  return Array.from(seen.values());
}

export function transformWeaponMasteryProperties(): TransformedWeaponMasteryProperty[] {
  const filePath = path.resolve(
    process.cwd(),
    "../5etools-src/data/items-base.json",
  );
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const masteries: {
    name: string;
    source: string;
    srd52?: boolean;
    entries?: unknown[];
    [key: string]: unknown;
  }[] = data.itemMastery ?? [];

  return masteries.map((m) => ({
    slug: generateSlug(m.name, m.source, m.srd52),
    name: m.name,
    description: m.entries ? parseEntriesAsText(m.entries as any[]) : "",
    source_code: m.source,
    raw: m as Record<string, unknown>,
  }));
}
