import * as fs from "fs";
import * as path from "path";
import { generateSlug } from "./slug-generator";
import { parseEntriesAsText } from "./entries-parser";
import { OPT_FEATURE_TYPE_MAP } from "./code-maps";

interface FiveToolsOptionalFeature {
  name: string;
  source: string;
  page?: number;
  srd52?: boolean;
  featureType: string[];
  prerequisite?: Record<string, unknown>[];
  entries?: unknown[];
  consumes?: { name: string };
  additionalSpells?: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface TransformedOptionalFeature {
  slug: string;
  name: string;
  description: string;
  feature_type: string;
  min_level: number | null;
  prerequisite: Record<string, unknown> | null;
  has_sub_choices: boolean;
  sub_choice_type: string | null;
  sub_choice_options: Record<string, unknown> | null;
  source_code: string;
  raw: Record<string, unknown>;
}

const RELEVANT_TYPES = new Set(Object.keys(OPT_FEATURE_TYPE_MAP));

function convertPrerequisites(prereqs?: Record<string, unknown>[]): {
  prerequisite: Record<string, unknown> | null;
  minLevel: number | null;
} {
  if (!prereqs?.length) return { prerequisite: null, minLevel: null };

  const result: Record<string, unknown> = {};
  let minLevel: number | null = null;

  for (const prereq of prereqs) {

    if (prereq.level && typeof prereq.level === "object") {
      const levelObj = prereq.level as Record<string, unknown>;
      const level = levelObj.level as number | undefined;
      if (level) {
        minLevel = level;
        result.minimum_level = level;
      }
      const classObj = levelObj.class as
        | { name: string; source?: string }
        | undefined;
      if (classObj) {
        result.class_name = classObj.name;
      }
    }


    if (prereq.spell) {
      const spells = prereq.spell as (
        | string
        | { choose?: string; entry?: string; entrySummary?: string }
      )[];
      const spellReqs: string[] = [];
      for (const spell of spells) {
        if (typeof spell === "string") {
          spellReqs.push(spell.split("|")[0]);
        } else if (spell.entrySummary) {
          spellReqs.push(spell.entrySummary);
        } else if (spell.entry) {
          spellReqs.push(spell.entry);
        }
      }
      if (spellReqs.length) result.spells = spellReqs;
    }


    if (prereq.optionalfeature) {
      const optFeats = prereq.optionalfeature as string[];
      result.optional_features = optFeats.map((f) => f.split("|")[0]);
    }


    if (prereq.item) {
      result.items = prereq.item;
    }


    if (prereq.otherSummary) {
      const summary = prereq.otherSummary as { entrySummary?: string };
      result.other = summary.entrySummary ?? "Special";
    }
  }

  return {
    prerequisite: Object.keys(result).length ? result : null,
    minLevel,
  };
}

function detectSubChoices(entry: FiveToolsOptionalFeature): {
  hasSubChoices: boolean;
  subChoiceType: string | null;
  subChoiceOptions: Record<string, unknown> | null;
} {

  if (entry.additionalSpells?.length) {
    return {
      hasSubChoices: true,
      subChoiceType: "spell",
      subChoiceOptions: { additional_spells: entry.additionalSpells },
    };
  }


  if (entry.consumes) {
    return {
      hasSubChoices: false,
      subChoiceType: null,
      subChoiceOptions: { consumes: entry.consumes },
    };
  }

  return {
    hasSubChoices: false,
    subChoiceType: null,
    subChoiceOptions: null,
  };
}

export function transformOptionalFeatures(): TransformedOptionalFeature[] {
  const filePath = path.resolve(
    process.cwd(),
    "../5etools-src/data/optionalfeatures.json",
  );
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const all: FiveToolsOptionalFeature[] = raw.optionalfeature ?? [];

  const srd52Items = all.filter(
    (item) =>
      item.srd52 === true &&
      item.featureType.some((ft) => RELEVANT_TYPES.has(ft)),
  );

  return srd52Items.map((item) => {
    const featureTypeCode = item.featureType[0];
    const featureType =
      OPT_FEATURE_TYPE_MAP[featureTypeCode] ?? featureTypeCode.toLowerCase();
    const slug = generateSlug(item.name, item.source, item.srd52);
    const description = parseEntriesAsText((item.entries ?? []) as any[]);
    const { prerequisite, minLevel } = convertPrerequisites(item.prerequisite);
    const { hasSubChoices, subChoiceType, subChoiceOptions } =
      detectSubChoices(item);

    return {
      slug,
      name: item.name,
      description,
      feature_type: featureType,
      min_level: minLevel,
      prerequisite,
      has_sub_choices: hasSubChoices,
      sub_choice_type: subChoiceType,
      sub_choice_options: subChoiceOptions,
      source_code: item.source,
      raw: item as unknown as Record<string, unknown>,
    };
  });
}
