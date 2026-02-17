import * as fs from 'fs';
import * as path from 'path';
import { generateSlug } from './slug-generator';
import { parseEntriesAsText } from './entries-parser';
import { FEAT_CATEGORY_MAP, ABILITY_MAP } from './code-maps';

interface FiveToolsFeat {
  name: string;
  source: string;
  page?: number;
  srd52?: boolean;
  category?: string;
  prerequisite?: Record<string, unknown>[];
  repeatable?: boolean;
  ability?: Record<string, unknown>[];
  additionalSpells?: Record<string, unknown>[];
  entries?: unknown[];
  [key: string]: unknown;
}

export interface TransformedFeat {
  slug: string;
  name: string;
  description: string;
  feat_type: string;
  repeatable: string | null;
  prerequisites: Record<string, unknown> | null;
  ability_options: Record<string, unknown> | null;
  additional_spells: Record<string, unknown>[] | null;
  source_code: string;
  raw: Record<string, unknown>;
}

function convertPrerequisites(
  prereqs?: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (!prereqs?.length) return null;

  const result: Record<string, unknown> = {};

  for (const prereq of prereqs) {
    if (prereq.level) result.minimum_level = prereq.level;

    if (prereq.ability && Array.isArray(prereq.ability)) {
      const abilityReqs: { ability: string; minimum: number }[] = [];
      for (const ab of prereq.ability) {
        for (const [key, val] of Object.entries(ab as Record<string, number>)) {
          const fullName = ABILITY_MAP[key];
          if (fullName) abilityReqs.push({ ability: fullName, minimum: val });
        }
      }
      if (abilityReqs.length) result.ability_requirements = abilityReqs;
    }

    if (prereq.spellcasting) result.spellcasting = true;

    if (prereq.race && Array.isArray(prereq.race)) {
      result.race = (prereq.race as { name: string }[]).map((r) => r.name);
    }

    if (prereq.feature) result.feature_named = prereq.feature;

    if (prereq.campaign) result.campaign = prereq.campaign;

    if (prereq.otherSummary) {
      const summary = prereq.otherSummary as { entrySummary?: string };
      result.other = summary.entrySummary ?? 'Special';
    }
  }

  return Object.keys(result).length ? result : null;
}

function convertAbilityOptions(
  ability?: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (!ability?.length) return null;

  const options: Record<string, unknown>[] = [];

  for (const ab of ability) {
    const choose = ab.choose as
      | { from?: string[]; amount?: number; count?: number }
      | undefined;
    if (choose) {
      const from = (choose.from ?? []).map(
        (k: string) => ABILITY_MAP[k] ?? k,
      );
      options.push({
        type: 'choose',
        from,
        amount: choose.amount ?? 1,
        count: choose.count ?? 1,
      });
    } else {
      // Direct bonuses like { "cha": 1 }
      const bonuses: { ability: string; bonus: number }[] = [];
      for (const [key, val] of Object.entries(ab)) {
        if (key === 'hidden') continue;
        const fullName = ABILITY_MAP[key];
        if (fullName && typeof val === 'number') {
          bonuses.push({ ability: fullName, bonus: val });
        }
      }
      if (bonuses.length) options.push({ type: 'fixed', bonuses });
    }
  }

  return options.length ? { options } : null;
}

export function transformFeats(): TransformedFeat[] {
  const filePath = path.resolve(
    process.cwd(),
    '../5etools-src/data/feats.json',
  );
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const feats: FiveToolsFeat[] = data.feat ?? [];

  return feats
    .filter((f) => !f.reprintedAs)
    .map((f) => {
      const categoryCode = f.category ?? '';
      const featType = FEAT_CATEGORY_MAP[categoryCode] ?? 'other';

      return {
        slug: generateSlug(f.name, f.source, f.srd52),
        name: f.name,
        description: f.entries
          ? parseEntriesAsText(f.entries as any[])
          : '',
        feat_type: featType,
        repeatable: f.repeatable ? 'true' : null,
        prerequisites: convertPrerequisites(f.prerequisite),
        ability_options: convertAbilityOptions(f.ability),
        additional_spells: f.additionalSpells ?? null,
        source_code: f.source,
        raw: f as Record<string, unknown>,
      };
    });
}
