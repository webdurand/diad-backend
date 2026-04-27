import { generateSlug } from "./slug-generator";
import { parseEntries } from "./entries-parser";
import { extractTraitEntries, type RaceTraitEntry } from "./transform-races";

// ────────────────────────────────────────────────────────────────
// Output type
// ────────────────────────────────────────────────────────────────

export interface TransformedTrait {
  slug: string;
  name: string;
  description: string[];
  proficiency_choices: Record<string, unknown> | null;
  trait_specific: Record<string, unknown> | null;
  language_options: Record<string, unknown> | null;
  source_code: string;
  race_slug: string;
  parent_slug: string | null;
  raw: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────
// Enrich traits with additional race-level data
// ────────────────────────────────────────────────────────────────

function resolveTraitSpecific(
  entry: RaceTraitEntry,
  raceRaw: Record<string, unknown>,
): Record<string, unknown> | null {
  const nameLower = entry.name.toLowerCase();

  // Detect breath weapon tables
  if (nameLower.includes("breath weapon")) {
    return { breath_weapon: true };
  }

  // Detect spell-related traits (additionalSpells on the race)
  if (
    raceRaw.additionalSpells &&
    (nameLower.includes("spell") ||
      nameLower.includes("magic") ||
      nameLower.includes("caller") ||
      nameLower.includes("cantrip"))
  ) {
    return { spell_options: raceRaw.additionalSpells };
  }

  return null;
}

function resolveLanguageOptions(
  entry: RaceTraitEntry,
): Record<string, unknown> | null {
  const nameLower = entry.name.toLowerCase();
  if (nameLower.includes("language")) {
    const text = entry.description.join(" ").toLowerCase();
    if (text.includes("choose") || text.includes("additional")) {
      return { choose: 1, type: "languages" };
    }
  }
  return null;
}

function resolveProficiencyChoices(
  entry: RaceTraitEntry,
): Record<string, unknown> | null {
  const nameLower = entry.name.toLowerCase();
  const text = entry.description.join(" ").toLowerCase();

  if (
    (nameLower.includes("proficiency") || nameLower.includes("tool")) &&
    (text.includes("choose") || text.includes("your choice"))
  ) {
    return { choose: 1, type: "proficiencies" };
  }

  return null;
}

// ────────────────────────────────────────────────────────────────
// Main: extract traits from races
// ────────────────────────────────────────────────────────────────

export interface TraitExtractionInput {
  raceSlug: string;
  sourceCode: string;
  srd52?: boolean;
  entries?: unknown[];
  raw: Record<string, unknown>;
}

export function extractTraitsFromRace(
  input: TraitExtractionInput,
): TransformedTrait[] {
  const traitEntries = extractTraitEntries(input.entries);
  if (traitEntries.length === 0) return [];

  const results: TransformedTrait[] = [];

  for (const entry of traitEntries) {
    // Skip generic size/speed entries that aren't real traits
    const nameLower = entry.name.toLowerCase();
    if (
      nameLower === "size" ||
      nameLower === "size:" ||
      nameLower === "speed" ||
      nameLower === "speed:"
    )
      continue;
    if (nameLower === "creature type" || nameLower === "creature type:")
      continue;

    const slug = generateSlug(entry.name, input.sourceCode, input.srd52);

    results.push({
      slug,
      name: entry.name,
      description: entry.description,
      proficiency_choices: resolveProficiencyChoices(entry),
      trait_specific: resolveTraitSpecific(entry, input.raw),
      language_options: resolveLanguageOptions(entry),
      source_code: input.sourceCode,
      race_slug: input.raceSlug,
      parent_slug: null,
      raw: {
        name: entry.name,
        entries: entry.description,
        source: input.sourceCode,
      },
    });
  }

  return results;
}

export function extractTraitsFromSubrace(input: {
  subraceSlug: string;
  raceSlug: string;
  sourceCode: string;
  srd52?: boolean;
  entries?: unknown[];
  raw: Record<string, unknown>;
}): TransformedTrait[] {
  const traitEntries = extractTraitEntries(input.entries);
  if (traitEntries.length === 0) return [];

  const results: TransformedTrait[] = [];

  for (const entry of traitEntries) {
    const nameLower = entry.name.toLowerCase();
    if (nameLower === "size" || nameLower === "size:") continue;

    const slug = generateSlug(entry.name, input.sourceCode, input.srd52);

    results.push({
      slug,
      name: entry.name,
      description: entry.description,
      proficiency_choices: resolveProficiencyChoices(entry),
      trait_specific: resolveTraitSpecific(entry, input.raw),
      language_options: resolveLanguageOptions(entry),
      source_code: input.sourceCode,
      race_slug: input.raceSlug,
      parent_slug: null,
      raw: {
        name: entry.name,
        entries: entry.description,
        source: input.sourceCode,
      },
    });
  }

  return results;
}
