import * as fs from "fs";
import * as path from "path";
import { generateSlug } from "./slug-generator";
import { parseEntries } from "./entries-parser";

// ────────────────────────────────────────────────────────────────
// 5etools input types
// ────────────────────────────────────────────────────────────────

interface FiveToolsClassFeature {
  name: string;
  source: string;
  page?: number;
  srd52?: boolean;
  className: string;
  classSource: string;
  level: number;
  entries?: unknown[];
  isClassFeatureVariant?: boolean;
  _copy?: unknown;
  [key: string]: unknown;
}

interface FiveToolsSubclassFeature {
  name: string;
  source: string;
  page?: number;
  srd52?: boolean;
  className: string;
  classSource: string;
  subclassShortName: string;
  subclassSource: string;
  level: number;
  header?: number;
  entries?: unknown[];
  isClassFeatureVariant?: boolean;
  _copy?: unknown;
  [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────
// Output types
// ────────────────────────────────────────────────────────────────

export interface TransformedFeature {
  slug: string;
  name: string;
  level: number;
  description: Record<string, unknown>;
  prerequisites: Record<string, unknown>;
  reference: string;
  feature_specific: Record<string, unknown> | null;
  class_slug: string;
  subclass_slug: string | null;
  source_code: string;
  is_subclass_feature: boolean;
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
  classFeature: FiveToolsClassFeature[];
  subclassFeature: FiveToolsSubclassFeature[];
  [key: string]: unknown;
} {
  const filePath = path.resolve(
    process.cwd(),
    `../5etools-src/data/class/${filename}`,
  );
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function resolveClassSlug(className: string, classSource: string): string {
  const srd52 = classSource === "XPHB";
  return generateSlug(className, classSource, srd52);
}

function resolveSubclassSlug(
  className: string,
  subclassShortName: string,
  subclassSource: string,
  srd52?: boolean,
): string {
  return generateSlug(
    `${className} ${subclassShortName}`,
    subclassSource,
    srd52,
  );
}

function buildFeatureSlug(
  name: string,
  className: string,
  source: string,
  level: number,
  srd52?: boolean,
  subclassShortName?: string,
): string {
  const suffix = subclassShortName
    ? `${className}-${subclassShortName}-${level}`
    : `${className}-${level}`;
  return generateSlug(`${name} ${suffix}`, source, srd52);
}

function buildReference(
  name: string,
  className: string,
  classSource: string,
  level: number,
  subclassShortName?: string,
  subclassSource?: string,
): string {
  if (subclassShortName && subclassSource) {
    return `${name}|${className}|${classSource}|${subclassShortName}|${subclassSource}|${level}`;
  }
  return `${name}|${className}|${classSource}|${level}`;
}

function resolveDescription(entries?: unknown[]): Record<string, unknown> {
  if (!entries || entries.length === 0) return { text: [] };
  return { text: parseEntries(entries as any[]) };
}

// ────────────────────────────────────────────────────────────────
// Main function
// ────────────────────────────────────────────────────────────────

export function transformFeatures(): TransformedFeature[] {
  const results: TransformedFeature[] = [];
  const seenSlugs = new Set<string>();

  for (const file of CLASS_FILES) {
    const data = loadClassFile(file);

    // Class features
    const classFeatures = data.classFeature ?? [];
    for (const feat of classFeatures) {
      if (feat._copy) continue;
      if (!CORE_CLASSES.has(feat.className.toLowerCase())) continue;

      const slug = buildFeatureSlug(
        feat.name,
        feat.className,
        feat.source,
        feat.level,
        feat.srd52,
      );

      // Deduplicate by slug
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);

      const classSlug = resolveClassSlug(feat.className, feat.classSource);
      const reference = buildReference(
        feat.name,
        feat.className,
        feat.classSource,
        feat.level,
      );

      results.push({
        slug,
        name: feat.name,
        level: feat.level,
        description: resolveDescription(feat.entries),
        prerequisites: { level: feat.level },
        reference,
        feature_specific: null,
        class_slug: classSlug,
        subclass_slug: null,
        source_code: feat.source,
        is_subclass_feature: false,
        raw: feat as Record<string, unknown>,
      });
    }

    // Subclass features
    const subclassFeatures = data.subclassFeature ?? [];
    for (const feat of subclassFeatures) {
      if (feat._copy) continue;
      if (!CORE_CLASSES.has(feat.className.toLowerCase())) continue;

      const slug = buildFeatureSlug(
        feat.name,
        feat.className,
        feat.source,
        feat.level,
        feat.srd52,
        feat.subclassShortName,
      );

      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);

      const classSlug = resolveClassSlug(feat.className, feat.classSource);
      const subclassSlug = resolveSubclassSlug(
        feat.className,
        feat.subclassShortName,
        feat.subclassSource,
        feat.srd52,
      );
      const reference = buildReference(
        feat.name,
        feat.className,
        feat.classSource,
        feat.level,
        feat.subclassShortName,
        feat.subclassSource,
      );

      results.push({
        slug,
        name: feat.name,
        level: feat.level,
        description: resolveDescription(feat.entries),
        prerequisites: { level: feat.level },
        reference,
        feature_specific:
          feat.header !== undefined ? { header: feat.header } : null,
        class_slug: classSlug,
        subclass_slug: subclassSlug,
        source_code: feat.source,
        is_subclass_feature: true,
        raw: feat as Record<string, unknown>,
      });
    }
  }

  return results;
}
