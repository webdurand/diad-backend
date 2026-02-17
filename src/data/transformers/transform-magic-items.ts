import * as fs from 'fs';
import * as path from 'path';
import { generateSlug } from './slug-generator';
import { parseEntriesAsText } from './entries-parser';
import { ITEM_TYPE_MAP } from './code-maps';
import { stripTags } from './tag-stripper';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

interface FiveToolsMagicItem {
  name: string;
  source: string;
  srd52?: boolean;
  type?: string;
  rarity?: string;
  reqAttune?: boolean | string;
  reqAttuneTags?: Record<string, unknown>[];
  wondrous?: boolean;
  weight?: number;
  value?: number;
  entries?: unknown[];
  bonusWeapon?: string;
  bonusAc?: string;
  bonusSpellAttack?: string;
  bonusSpellSaveDc?: string;
  bonusSavingThrow?: string;
  charges?: number;
  recharge?: string;
  rechargeAmount?: string;
  focus?: string[];
  baseItem?: string;
  requires?: Record<string, unknown>[];
  inherits?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TransformedMagicItem {
  slug: string;
  name: string;
  source_code: string;
  rarity: { name: string };
  is_variant: boolean;
  description: { text: string; entries?: unknown[] };
  image: string | null;
  weight: number;
  cost: { quantity: number; unit: string } | null;
  attunement: { required: boolean; condition?: string } | null;
  bonuses: Record<string, string> | null;
  charges_info: { charges: number; recharge?: string; rechargeAmount?: string } | null;
  category_slug: string | null;
  raw: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function extractTypeCode(type: string): string {
  return type.split('|')[0];
}

function convertCost(valueCp: number): { quantity: number; unit: string } {
  if (valueCp >= 100) return { quantity: Math.floor(valueCp / 100), unit: 'gp' };
  if (valueCp >= 10) return { quantity: Math.floor(valueCp / 10), unit: 'sp' };
  return { quantity: valueCp, unit: 'cp' };
}

function capitalizeRarity(rarity: string): string {
  const map: Record<string, string> = {
    common: 'Common',
    uncommon: 'Uncommon',
    rare: 'Rare',
    'very rare': 'Very Rare',
    legendary: 'Legendary',
    artifact: 'Artifact',
    varies: 'Varies',
    unknown: 'Unknown',
  };
  return map[rarity.toLowerCase()] ?? rarity;
}

function parseAttunement(
  item: FiveToolsMagicItem,
): TransformedMagicItem['attunement'] {
  if (item.reqAttune === true) {
    return { required: true };
  }
  if (typeof item.reqAttune === 'string') {
    return { required: true, condition: stripTags(item.reqAttune) };
  }
  return null;
}

function parseBonuses(
  item: FiveToolsMagicItem,
): Record<string, string> | null {
  const bonuses: Record<string, string> = {};
  if (item.bonusWeapon) bonuses.weapon = item.bonusWeapon;
  if (item.bonusAc) bonuses.ac = item.bonusAc;
  if (item.bonusSpellAttack) bonuses.spellAttack = item.bonusSpellAttack;
  if (item.bonusSpellSaveDc) bonuses.spellSaveDc = item.bonusSpellSaveDc;
  if (item.bonusSavingThrow) bonuses.savingThrow = item.bonusSavingThrow;
  return Object.keys(bonuses).length > 0 ? bonuses : null;
}

function parseChargesInfo(
  item: FiveToolsMagicItem,
): TransformedMagicItem['charges_info'] {
  if (item.charges == null) return null;
  const info: TransformedMagicItem['charges_info'] = {
    charges: item.charges,
  };
  if (item.recharge) info!.recharge = item.recharge;
  if (item.rechargeAmount) info!.rechargeAmount = stripTags(item.rechargeAmount);
  return info;
}

function getCategorySlug(item: FiveToolsMagicItem): string | null {
  if (!item.type) {
    // Wondrous items without type get "wondrous-item" if available, else null
    if (item.wondrous) return null;
    return null;
  }
  const code = extractTypeCode(item.type);
  return ITEM_TYPE_MAP[code] ?? null;
}

// ────────────────────────────────────────────────────────────────
// Main transformer
// ────────────────────────────────────────────────────────────────

function transformItem(item: FiveToolsMagicItem): TransformedMagicItem {
  const slug = generateSlug(item.name, item.source, item.srd52);
  const isGV = item.type === 'GV';
  const entries = item.entries ?? [];
  const descriptionText = entries.length
    ? parseEntriesAsText(entries as any[])
    : '';

  return {
    slug,
    name: item.name,
    source_code: item.source,
    rarity: { name: capitalizeRarity(item.rarity ?? 'unknown') },
    is_variant: isGV,
    description: {
      text: descriptionText,
      entries: entries.length > 0 ? entries : undefined,
    },
    image: null,
    weight: item.weight ?? 0,
    cost: item.value != null ? convertCost(item.value) : null,
    attunement: parseAttunement(item),
    bonuses: parseBonuses(item),
    charges_info: parseChargesInfo(item),
    category_slug: getCategorySlug(item),
    raw: item as Record<string, unknown>,
  };
}

export function transformMagicItems(): TransformedMagicItem[] {
  const filePath = path.resolve(
    process.cwd(),
    '../5etools-src/data/items.json',
  );
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const allItems: FiveToolsMagicItem[] = data.item ?? [];

  // Filter: SRD52 items with rarity that is NOT "none" (magic items only)
  const magicItems = allItems.filter(
    (i) => i.srd52 && i.rarity !== 'none',
  );

  // Deduplicate by slug, preferring SRD52/XPHB/XDMG
  const seen = new Map<string, TransformedMagicItem>();

  for (const item of magicItems) {
    const transformed = transformItem(item);
    const existing = seen.get(transformed.slug);
    if (!existing || item.srd52) {
      seen.set(transformed.slug, transformed);
    }
  }

  return Array.from(seen.values());
}
