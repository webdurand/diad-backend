import { generateSlug } from "./slug-generator";
import { parseEntries } from "./entries-parser";
import { extractTraitEntries, type RaceTraitEntry } from "./transform-races";

export interface TransformedTrait {
  slug: string;
  canonical_slug: string;
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

function ownerScopedTraitSlug(
  canonicalSlug: string,
  ownerKind: "race" | "subrace",
  ownerSlug: string,
): string {
  return `${ownerKind}-${ownerSlug}-${canonicalSlug}`;
}

export function disambiguateTraitStorageSlugs(
  traits: TransformedTrait[],
): TransformedTrait[] {
  const definitions = new Map<string, Set<string>>();
  for (const trait of traits) {
    const fingerprint = JSON.stringify({
      name: trait.name,
      description: trait.description,
      proficiency_choices: trait.proficiency_choices,
      trait_specific: trait.trait_specific,
      language_options: trait.language_options,
      source_code: trait.source_code,
    });
    const fingerprints =
      definitions.get(trait.canonical_slug) ?? new Set<string>();
    fingerprints.add(fingerprint);
    definitions.set(trait.canonical_slug, fingerprints);
  }

  return traits.map((trait) => {
    if ((definitions.get(trait.canonical_slug)?.size ?? 0) <= 1) {
      return trait;
    }
    const owner = trait.raw.traitOwner as
      | {
          kind?: unknown;
          raceSlug?: unknown;
          subraceSlug?: unknown;
        }
      | undefined;
    if (owner?.kind === "race" && typeof owner.raceSlug === "string") {
      return {
        ...trait,
        slug: ownerScopedTraitSlug(
          trait.canonical_slug,
          "race",
          owner.raceSlug,
        ),
      };
    }
    if (owner?.kind === "subrace" && typeof owner.subraceSlug === "string") {
      return {
        ...trait,
        slug: ownerScopedTraitSlug(
          trait.canonical_slug,
          "subrace",
          owner.subraceSlug,
        ),
      };
    }
    return trait;
  });
}

function resolveTraitSpecific(
  entry: RaceTraitEntry,
  raceRaw: Record<string, unknown>,
): Record<string, unknown> | null {
  const nameLower = entry.name.toLowerCase();

  if (nameLower.includes("breath weapon")) {
    return { breath_weapon: true };
  }

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

    const canonicalSlug = generateSlug(
      entry.name,
      input.sourceCode,
      input.srd52,
    );

    results.push({
      slug: canonicalSlug,
      canonical_slug: canonicalSlug,
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
        canonicalSlug,
        traitOwner: {
          kind: "race",
          raceSlug: input.raceSlug,
        },
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

    const canonicalSlug = generateSlug(
      entry.name,
      input.sourceCode,
      input.srd52,
    );

    results.push({
      slug: canonicalSlug,
      canonical_slug: canonicalSlug,
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
        canonicalSlug,
        traitOwner: {
          kind: "subrace",
          raceSlug: input.raceSlug,
          subraceSlug: input.subraceSlug,
        },
      },
    });
  }

  return results;
}
