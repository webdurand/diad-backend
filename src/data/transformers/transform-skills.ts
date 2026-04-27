import * as fs from "fs";
import * as path from "path";
import { generateSlug } from "./slug-generator";
import { parseEntriesAsText } from "./entries-parser";
import { ABILITY_MAP } from "./code-maps";

interface FiveToolsSkill {
  name: string;
  source: string;
  srd52?: boolean;
  ability?: string; // "str" | "dex" | "con" | "int" | "wis" | "cha"
  entries?: unknown[];
  [key: string]: unknown;
}

export interface TransformedSkill {
  slug: string;
  name: string;
  description: string;
  ability_score_slug: string | null;
  source_code: string;
  raw: Record<string, unknown>;
}

export function transformSkills(): TransformedSkill[] {
  const filePath = path.resolve(
    process.cwd(),
    "../5etools-src/data/skills.json",
  );
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const skills: FiveToolsSkill[] = data.skill ?? [];

  return skills.map((s) => ({
    slug: generateSlug(s.name, s.source, s.srd52),
    name: s.name,
    description: s.entries ? parseEntriesAsText(s.entries as any[]) : "",
    ability_score_slug: s.ability ? (ABILITY_MAP[s.ability] ?? null) : null,
    source_code: s.source,
    raw: s as Record<string, unknown>,
  }));
}
