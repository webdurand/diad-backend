import * as fs from "fs";
import * as path from "path";
import { generateSlug } from "./slug-generator";
import { parseEntries } from "./entries-parser";

// ────────────────────────────────────────────────────────────────
// 5etools input types
// ────────────────────────────────────────────────────────────────

interface FiveToolsSubclass {
  name: string;
  shortName: string;
  source: string;
  className: string;
  classSource: string;
  page?: number;
  edition?: string;
  srd?: boolean;
  srd52?: boolean;
  additionalSpells?: unknown[];
  subclassFeatures?: string[];
  entries?: unknown[];
  reprintedAs?: string[];
  _copy?: unknown;
  [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────
// Output types
// ────────────────────────────────────────────────────────────────

export interface TransformedSubclass {
  slug: string;
  name: string;
  subclass_flavor: string;
  description: string[];
  spells: Record<string, unknown> | null;
  class_slug: string;
  source_code: string;
  feature_refs: string[];
  raw: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const CORE_CLASSES = new Set([
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
]);

const CLASS_FILES = [
  "class-barbarian.json",
  "class-bard.json",
  "class-cleric.json",
  "class-druid.json",
  "class-fighter.json",
  "class-monk.json",
  "class-paladin.json",
  "class-ranger.json",
  "class-rogue.json",
  "class-sorcerer.json",
  "class-warlock.json",
  "class-wizard.json",
];

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function loadClassFile(filename: string): {
  subclass: FiveToolsSubclass[];
  [key: string]: unknown;
} {
  const filePath = path.resolve(
    process.cwd(),
    `../5etools-src/data/class/${filename}`,
  );
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function isImportable(sub: FiveToolsSubclass): boolean {
  // Skip _copy entries (cross-edition duplicates without original data)
  if (sub._copy) return false;
  // Only import subclasses for core classes
  if (!CORE_CLASSES.has(sub.className.toLowerCase())) return false;
  return true;
}

function resolveClassSlug(className: string, classSource: string): string {
  const srd52 = classSource === "XPHB";
  return generateSlug(className, classSource, srd52);
}

function resolveSpells(
  additionalSpells?: unknown[],
): Record<string, unknown> | null {
  if (!additionalSpells || additionalSpells.length === 0) return null;
  return { additional_spells: additionalSpells };
}

function resolveDescription(entries?: unknown[]): string[] {
  if (!entries || entries.length === 0) return [""];
  return parseEntries(entries as any[]);
}

function resolveFlavorText(sub: FiveToolsSubclass): string {
  // Use the subclass name as a basic flavor if no dedicated flavor field exists
  return `${sub.className}: ${sub.name}`;
}

// ────────────────────────────────────────────────────────────────
// Main function
// ────────────────────────────────────────────────────────────────

export function transformSubclasses(): TransformedSubclass[] {
  const results: TransformedSubclass[] = [];

  for (const file of CLASS_FILES) {
    const data = loadClassFile(file);
    const subclasses = data.subclass ?? [];

    for (const sub of subclasses) {
      if (!isImportable(sub)) continue;

      const slug = generateSlug(
        `${sub.className} ${sub.shortName ?? sub.name}`,
        sub.source,
        sub.srd52,
      );
      const classSlug = resolveClassSlug(sub.className, sub.classSource);

      results.push({
        slug,
        name: sub.shortName ?? sub.name,
        subclass_flavor: resolveFlavorText(sub),
        description: resolveDescription(sub.entries),
        spells: resolveSpells(sub.additionalSpells),
        class_slug: classSlug,
        source_code: sub.source,
        feature_refs: sub.subclassFeatures ?? [],
        raw: sub as Record<string, unknown>,
      });
    }
  }

  return results;
}
