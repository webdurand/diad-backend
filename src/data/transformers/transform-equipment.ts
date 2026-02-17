import * as fs from 'fs';
import * as path from 'path';
import { generateSlug } from './slug-generator';
import { parseEntriesAsText } from './entries-parser';
import { ITEM_TYPE_MAP, DAMAGE_TYPE_MAP, WEAPON_PROPERTY_MAP } from './code-maps';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

interface FiveToolsBaseItem {
  name: string;
  source: string;
  srd52?: boolean;
  type?: string;
  rarity?: string;
  weight?: number;
  value?: number;
  ac?: number;
  stealth?: boolean;
  strength?: string;
  weapon?: boolean;
  firearm?: boolean;
  armor?: boolean;
  ammunition?: boolean;
  weaponCategory?: string;
  dmg1?: string;
  dmg2?: string;
  dmgType?: string;
  property?: (string | Record<string, unknown>)[];
  mastery?: string[];
  range?: string;
  entries?: unknown[];
  additionalEntries?: unknown[];
  reprintedAs?: string[];
  [key: string]: unknown;
}

export interface TransformedEquipment {
  slug: string;
  name: string;
  source_code: string;
  weight: number;
  description: string;
  cost: { quantity: number; unit: string };
  damage: { dice: string; type: string; versatile_dice?: string } | null;
  armor_class: { base: number; dex_bonus: boolean; max_bonus?: number } | null;
  properties: string[];
  mastery_slugs: string[];
  range: { normal: number; long?: number } | null;
  weapon_category: string | null;
  stealth_disadvantage: boolean;
  str_minimum: number | null;
  don_time: string | null;
  doff_time: string | null;
  consumable_effect: Record<string, unknown> | null;
  utilize: Record<string, unknown> | null;
  contents: Record<string, unknown> | null;
  craft: Record<string, unknown> | null;
  category_slugs: string[];
  raw: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function convertCost(valueCp: number): { quantity: number; unit: string } {
  if (valueCp >= 100) return { quantity: Math.floor(valueCp / 100), unit: 'gp' };
  if (valueCp >= 10) return { quantity: Math.floor(valueCp / 10), unit: 'sp' };
  return { quantity: valueCp, unit: 'cp' };
}

function extractTypeCode(type: string): string {
  // 5etools uses "M|XPHB", "HA|XPHB" — extract the code before the pipe
  return type.split('|')[0];
}

function parseDamage(
  item: FiveToolsBaseItem,
): TransformedEquipment['damage'] {
  if (!item.dmg1) return null;
  const dmgType = item.dmgType ? (DAMAGE_TYPE_MAP[item.dmgType] ?? item.dmgType.toLowerCase()) : 'unknown';
  return {
    dice: item.dmg1,
    type: dmgType,
    versatile_dice: item.dmg2 ?? undefined,
  };
}

function parseArmorClass(
  item: FiveToolsBaseItem,
): TransformedEquipment['armor_class'] {
  if (item.ac == null) return null;
  const typeCode = item.type ? extractTypeCode(item.type) : '';
  // Light armor: +full DEX, Medium: +DEX (max 2), Heavy: no DEX, Shield: +2
  if (typeCode === 'LA') {
    return { base: item.ac, dex_bonus: true };
  }
  if (typeCode === 'MA') {
    return { base: item.ac, dex_bonus: true, max_bonus: 2 };
  }
  if (typeCode === 'HA') {
    return { base: item.ac, dex_bonus: false };
  }
  if (typeCode === 'S') {
    return { base: item.ac, dex_bonus: false };
  }
  return { base: item.ac, dex_bonus: false };
}

function parseProperties(props?: (string | Record<string, unknown>)[]): string[] {
  if (!props?.length) return [];
  return props
    .map((p) => {
      const raw = typeof p === 'string' ? p : (p as Record<string, unknown>).uid as string ?? '';
      if (!raw) return '';
      const code = raw.split('|')[0];
      return WEAPON_PROPERTY_MAP[code] ?? code.toLowerCase();
    })
    .filter(Boolean);
}

function parseMasterySlugList(masteries?: string[]): string[] {
  if (!masteries?.length) return [];
  return masteries.map((m) => {
    const name = m.split('|')[0];
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  });
}

function parseRange(rangeStr?: string): TransformedEquipment['range'] {
  if (!rangeStr) return null;
  const parts = rangeStr.split('/').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { normal: parts[0], long: parts[1] };
  }
  if (parts.length === 1 && !isNaN(parts[0])) {
    return { normal: parts[0] };
  }
  return null;
}

function getCategorySlugs(item: FiveToolsBaseItem): string[] {
  const slugs: string[] = [];
  if (item.type) {
    const code = extractTypeCode(item.type);
    const slug = ITEM_TYPE_MAP[code];
    if (slug) slugs.push(slug);
  }
  return slugs;
}

// D&D 5e armor don/doff times by category
const ARMOR_DON_DOFF: Record<string, { don: string; doff: string }> = {
  LA: { don: '1 minute', doff: '1 minute' },
  MA: { don: '5 minutes', doff: '1 minute' },
  HA: { don: '10 minutes', doff: '5 minutes' },
  S: { don: '1 action', doff: '1 action' },
};

function getDescription(item: FiveToolsBaseItem): string {
  const allEntries: unknown[] = [
    ...(item.entries ?? []),
    ...(item.additionalEntries ?? []),
  ];
  if (!allEntries.length) return '';
  return parseEntriesAsText(allEntries as any[]);
}

// ────────────────────────────────────────────────────────────────
// Main transformer
// ────────────────────────────────────────────────────────────────

function transformItem(item: FiveToolsBaseItem): TransformedEquipment {
  const slug = generateSlug(item.name, item.source, item.srd52);
  const typeCode = item.type ? extractTypeCode(item.type) : '';
  const donDoff = ARMOR_DON_DOFF[typeCode];

  return {
    slug,
    name: item.name,
    source_code: item.source,
    weight: item.weight ?? 0,
    description: getDescription(item),
    cost: item.value != null ? convertCost(item.value) : { quantity: 0, unit: 'gp' },
    damage: parseDamage(item),
    armor_class: parseArmorClass(item),
    properties: parseProperties(item.property),
    mastery_slugs: parseMasterySlugList(item.mastery),
    range: parseRange(item.range),
    weapon_category: item.weaponCategory ?? null,
    stealth_disadvantage: !!item.stealth,
    str_minimum: item.strength ? parseInt(item.strength, 10) : null,
    don_time: donDoff?.don ?? null,
    doff_time: donDoff?.doff ?? null,
    consumable_effect: (item as any).consumable_effect ?? null,
    utilize: (item as any).utilize ?? null,
    contents: (item as any).contents ?? null,
    craft: (item as any).craft ?? null,
    category_slugs: getCategorySlugs(item),
    raw: item as Record<string, unknown>,
  };
}

export function transformEquipment(): TransformedEquipment[] {
  // ── Source 1: items-base.json (baseitems) ──
  const baseFilePath = path.resolve(
    process.cwd(),
    '../5etools-src/data/items-base.json',
  );
  const baseData = JSON.parse(fs.readFileSync(baseFilePath, 'utf-8'));
  const baseItems: FiveToolsBaseItem[] = baseData.baseitem ?? [];

  // ── Source 2: items.json (mundane items with rarity "none") ──
  const itemsFilePath = path.resolve(
    process.cwd(),
    '../5etools-src/data/items.json',
  );
  const itemsData = JSON.parse(fs.readFileSync(itemsFilePath, 'utf-8'));
  const allItems: FiveToolsBaseItem[] = itemsData.item ?? [];
  const mundaneItems = allItems.filter(
    (i) => i.rarity === 'none' && i.srd52,
  );

  // ── Merge and deduplicate ──
  const seen = new Map<string, TransformedEquipment>();

  // Process base items first
  for (const item of baseItems) {
    const transformed = transformItem(item);
    const existing = seen.get(transformed.slug);
    // Prefer XPHB/SRD52 version
    if (!existing || item.srd52 || item.source === 'XPHB') {
      seen.set(transformed.slug, transformed);
    }
  }

  // Add mundane items from items.json that aren't already covered
  for (const item of mundaneItems) {
    const transformed = transformItem(item);
    if (!seen.has(transformed.slug)) {
      seen.set(transformed.slug, transformed);
    }
  }

  return Array.from(seen.values());
}
