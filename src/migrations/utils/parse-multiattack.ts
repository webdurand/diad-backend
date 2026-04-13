import type { MonsterMultiattack, MonsterMultiattackSubAttack } from '../../models/game-engine/interfaces/monster-typed';

/**
 * Parses a monster's Multiattack description into a structured `MonsterMultiattack`.
 *
 * Supported SRD patterns:
 *   - "makes N attacks: K with Y and M with Z"
 *   - "makes N attacks: one with X and one with Y"  (word-numbers)
 *   - "makes N attacks: one X, one Y, and one Z"
 *   - "makes N X attacks"
 *   - "makes N attacks with its X"
 *   - "makes a X attack and a Y attack"
 *
 * Sub-action names are resolved against the monster's `actions` list so the
 * resolver can match them back to the statblock entry when applying the attack.
 * Unknown sub-actions are kept as-is (the resolver will log a warning).
 *
 * Returns `null` when no pattern matches — caller should leave `multiattack`
 * NULL and rely on the runtime fallback (single attack).
 */

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

function toNumber(token: string): number | null {
  const lower = token.toLowerCase();
  if (WORD_NUMBERS[lower] !== undefined) return WORD_NUMBERS[lower];
  const n = parseInt(lower, 10);
  return Number.isFinite(n) ? n : null;
}

function findActionName(
  needle: string,
  actions: Array<{ name?: string }>,
): string | null {
  const target = needle.trim().toLowerCase();
  if (!target) return null;
  const singular = target.replace(/s$/i, '');
  for (const a of actions) {
    if (!a?.name) continue;
    const nameLower = a.name.toLowerCase();
    if (nameLower === target || nameLower === singular) return a.name;
    if (nameLower.includes(target) || target.includes(nameLower)) return a.name;
    if (nameLower.includes(singular) || singular.includes(nameLower)) return a.name;
  }
  return null;
}

function normalizeSubName(raw: string): string {
  const clean = raw
    .replace(/\bweapon\b/gi, '')
    .replace(/\bmelee\b/gi, '')
    .replace(/\branged\b/gi, '')
    .replace(/\battack(?:s)?\b/gi, '')
    .replace(/\bits\b/gi, '')
    .replace(/\bwith\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.replace(/\.$/, '');
}

export function parseMultiattackFromDescription(
  description: string,
  actions: Array<{ name?: string }> = [],
): MonsterMultiattack | null {
  if (!description) return null;
  const text = description.trim();
  const lower = text.toLowerCase();

  if (!/multiattack|\bmakes\s+\w+/i.test(text)) {
    return null;
  }
  if (!/attack(?:s)?\b/i.test(text)) {
    return null;
  }

  const sequence: MonsterMultiattackSubAttack[] = [];

  // Pattern: "makes N attacks: K <kind> and M <kind>"
  //          "makes N attacks: one <kind> and one <kind>"
  const colonMatch = lower.match(
    /makes\s+(\w+)\s+attacks?\s*[:\-]\s*([^.]+?)(?:\.|$)/i,
  );
  if (colonMatch) {
    const body = colonMatch[2];
    // Split on commas + 'and'
    const parts = body
      .split(/,| and |,\s*and\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      // "one with its beak", "two beak attacks", "one bite"
      const qtyMatch = part.match(/^(\w+)\s+(.+)$/);
      if (!qtyMatch) continue;
      const qty = toNumber(qtyMatch[1]);
      if (qty === null) continue;
      const subRaw = normalizeSubName(qtyMatch[2]);
      const resolved = findActionName(subRaw, actions) ?? toTitleCase(subRaw);
      if (!resolved) continue;
      sequence.push({ actionName: resolved, count: qty });
    }
    if (sequence.length > 0) {
      return { sequence: mergeDuplicates(sequence), description: text };
    }
  }

  // Pattern: "makes two X attacks" or "makes two attacks with its X"
  const simpleMatch = lower.match(
    /makes\s+(\w+)\s+(?:(.+?)\s+attacks?|attacks?\s+with\s+(?:its\s+)?(.+?))(?:[.,]|$)/i,
  );
  if (simpleMatch) {
    const count = toNumber(simpleMatch[1]);
    const subRaw = simpleMatch[2] ?? simpleMatch[3];
    if (count !== null && subRaw) {
      const cleaned = normalizeSubName(subRaw);
      const resolved = findActionName(cleaned, actions) ?? toTitleCase(cleaned);
      if (resolved) {
        sequence.push({ actionName: resolved, count });
        return { sequence: mergeDuplicates(sequence), description: text };
      }
    }
  }

  // Pattern: "makes a X attack and a Y attack"
  const pairMatch = lower.match(
    /makes\s+(?:a\s+)?(\w+[\w\s]*?)\s+attack\s+and\s+(?:a\s+)?(\w+[\w\s]*?)\s+attack/i,
  );
  if (pairMatch) {
    for (const raw of [pairMatch[1], pairMatch[2]]) {
      const cleaned = normalizeSubName(raw);
      const resolved = findActionName(cleaned, actions) ?? toTitleCase(cleaned);
      if (resolved) sequence.push({ actionName: resolved, count: 1 });
    }
    if (sequence.length > 0) {
      return { sequence: mergeDuplicates(sequence), description: text };
    }
  }

  return null;
}

function mergeDuplicates(seq: MonsterMultiattackSubAttack[]): MonsterMultiattackSubAttack[] {
  const map = new Map<string, MonsterMultiattackSubAttack>();
  for (const s of seq) {
    const existing = map.get(s.actionName);
    if (existing) existing.count += s.count;
    else map.set(s.actionName, { ...s });
  }
  return Array.from(map.values());
}

function toTitleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}
