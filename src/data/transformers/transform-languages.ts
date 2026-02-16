import * as fs from 'fs';
import * as path from 'path';
import { generateSlug } from './slug-generator';
import { stripTags } from './tag-stripper';

interface FiveToolsLanguage {
  name: string;
  source: string;
  srd52?: boolean;
  type?: string; // "standard" | "exotic" | "rare"
  origin?: string;
  typicalSpeakers?: string[];
  script?: string;
  entries?: unknown[];
  [key: string]: unknown;
}

export interface TransformedLanguage {
  slug: string;
  name: string;
  is_rare: boolean;
  note: string | null;
  source_code: string;
  raw: Record<string, unknown>;
}

export function transformLanguages(): TransformedLanguage[] {
  const filePath = path.resolve(
    process.cwd(),
    '../5etools-src/data/languages.json',
  );
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const languages: FiveToolsLanguage[] = data.language ?? [];

  return languages.map((l) => {
    const isRare = l.type === 'rare' || l.type === 'exotic';

    const noteParts: string[] = [];
    if (l.origin) noteParts.push(`Origin: ${stripTags(l.origin)}`);
    if (l.typicalSpeakers?.length) {
      const speakers = l.typicalSpeakers.map((s) => stripTags(s)).join(', ');
      noteParts.push(`Typical speakers: ${speakers}`);
    }
    if (l.script) noteParts.push(`Script: ${l.script}`);

    return {
      slug: generateSlug(l.name, l.source, l.srd52),
      name: l.name,
      is_rare: isRare,
      note: noteParts.length > 0 ? noteParts.join('. ') : null,
      source_code: l.source,
      raw: l as Record<string, unknown>,
    };
  });
}
