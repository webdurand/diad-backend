import { stripTags } from './tag-stripper';
import { ABILITY_MAP } from './code-maps';

type Entry = string | EntryObject;

interface EntryObject {
  type: string;
  name?: string;
  caption?: string;
  style?: string;
  entries?: Entry[];
  items?: Entry[] | ItemObject[];
  colLabels?: string[];
  colStyles?: string[];
  rows?: (string | EntryObject)[][];
  attributes?: string[];
  [key: string]: unknown;
}

interface ItemObject {
  type: string;
  name?: string;
  entry?: string;
  entries?: Entry[];
}

function parseEntry(entry: Entry): string[] {
  if (typeof entry === 'string') {
    return [stripTags(entry)];
  }

  if (typeof entry !== 'object' || entry === null) {
    return [];
  }

  return parseEntryObject(entry);
}

function parseEntryObject(obj: EntryObject): string[] {
  const lines: string[] = [];

  switch (obj.type) {
    case 'entries':
    case 'section':
    case 'inset':
    case 'insetReadaloud': {
      if (obj.name) {
        lines.push(`**${stripTags(obj.name)}**`);
      }
      if (obj.entries) {
        for (const child of obj.entries) {
          lines.push(...parseEntry(child));
        }
      }
      break;
    }

    case 'list': {
      if (obj.items) {
        for (const item of obj.items) {
          if (typeof item === 'string') {
            lines.push(`- ${stripTags(item)}`);
          } else if (typeof item === 'object' && item !== null) {
            const itemObj = item as ItemObject;
            if (itemObj.type === 'item' && itemObj.name) {
              const entryText = itemObj.entry
                ? stripTags(itemObj.entry)
                : itemObj.entries
                  ? itemObj.entries.map((e) => parseEntry(e).join(' ')).join(' ')
                  : '';
              lines.push(`- **${stripTags(itemObj.name)}** ${entryText}`.trim());
            } else {
              lines.push(...parseEntry(item as Entry));
            }
          }
        }
      }
      break;
    }

    case 'table': {
      if (obj.caption) {
        lines.push(`**${stripTags(obj.caption)}**`);
      }
      if (obj.colLabels && obj.colLabels.length > 0) {
        const headers = obj.colLabels.map((h) => stripTags(h));
        lines.push(`| ${headers.join(' | ')} |`);
        lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
      }
      if (obj.rows) {
        for (const row of obj.rows) {
          const cells = row.map((cell) => {
            if (typeof cell === 'string') return stripTags(cell);
            return parseEntry(cell as Entry).join(' ');
          });
          lines.push(`| ${cells.join(' | ')} |`);
        }
      }
      break;
    }

    case 'abilityDc': {
      const name = obj.name ? stripTags(obj.name) : 'Spell';
      const attrs = (obj.attributes ?? [])
        .map((a) => ABILITY_MAP[a] ?? a)
        .map((a) => a.charAt(0).toUpperCase() + a.slice(1));
      lines.push(`**${name} save DC** = 8 + your proficiency bonus + your ${attrs.join('/')} modifier`);
      break;
    }

    case 'abilityAttackMod': {
      const name = obj.name ? stripTags(obj.name) : 'Spell';
      const attrs = (obj.attributes ?? [])
        .map((a) => ABILITY_MAP[a] ?? a)
        .map((a) => a.charAt(0).toUpperCase() + a.slice(1));
      lines.push(`**${name} attack modifier** = your proficiency bonus + your ${attrs.join('/')} modifier`);
      break;
    }

    case 'quote': {
      if (obj.entries) {
        for (const child of obj.entries) {
          const parsed = parseEntry(child);
          lines.push(...parsed.map((l) => `> ${l}`));
        }
      }
      if (obj.by) {
        lines.push(`> — ${stripTags(obj.by as string)}`);
      }
      break;
    }

    case 'cell': {
      if (obj.entry) {
        lines.push(...parseEntry(obj.entry as Entry));
      } else if (obj.entries) {
        for (const child of obj.entries) {
          lines.push(...parseEntry(child));
        }
      }
      break;
    }

    default: {
      // Fallback: try to parse entries or items
      if (obj.entries) {
        if (obj.name) {
          lines.push(`**${stripTags(obj.name)}**`);
        }
        for (const child of obj.entries) {
          lines.push(...parseEntry(child));
        }
      } else if (obj.items) {
        for (const item of obj.items) {
          lines.push(...parseEntry(item as Entry));
        }
      }
      break;
    }
  }

  return lines;
}

export function parseEntries(entries: Entry[]): string[] {
  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(...parseEntry(entry));
  }
  return lines;
}

export function parseEntriesAsText(entries: Entry[]): string {
  return parseEntries(entries).join('\n');
}
