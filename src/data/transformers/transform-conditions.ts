import * as fs from 'fs';
import * as path from 'path';
import { generateSlug } from './slug-generator';
import { parseEntriesAsText } from './entries-parser';

interface FiveToolsCondition {
  name: string;
  source: string;
  page?: number;
  srd52?: boolean;
  entries?: unknown[];
  [key: string]: unknown;
}

export interface TransformedCondition {
  slug: string;
  name: string;
  description: string;
  source_code: string;
  raw: Record<string, unknown>;
}

export function transformConditions(): TransformedCondition[] {
  const filePath = path.resolve(
    process.cwd(),
    '../5etools-src/data/conditionsdiseases.json',
  );
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const conditions: FiveToolsCondition[] = data.condition ?? [];

  return conditions.map((c) => ({
    slug: generateSlug(c.name, c.source, c.srd52),
    name: c.name,
    description: c.entries ? parseEntriesAsText(c.entries as any[]) : '',
    source_code: c.source,
    raw: c as Record<string, unknown>,
  }));
}
