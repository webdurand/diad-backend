import * as fs from 'fs';
import * as path from 'path';
import { generateSlug } from './slug-generator';

// ────────────────────────────────────────────────────────────────
// 5etools input types
// ────────────────────────────────────────────────────────────────

interface FiveToolsClass {
  name: string;
  source: string;
  srd52?: boolean;
  casterProgression?: string;
  classTableGroups?: ClassTableGroup[];
  classFeatures?: (string | { classFeature: string; gainSubclassFeature?: boolean })[];
  _copy?: unknown;
  [key: string]: unknown;
}

interface ClassTableGroup {
  title?: string;
  colLabels?: string[];
  rows?: number[][];
  rowsSpellProgression?: number[][];
}

// ────────────────────────────────────────────────────────────────
// Output types
// ────────────────────────────────────────────────────────────────

export interface TransformedLevel {
  slug: string;
  level: number;
  ability_score_bonuses: number;
  prof_bonus: number;
  spellcasting: Record<string, unknown> | null;
  class_specific: Record<string, unknown> | null;
  class_slug: string;
  source_code: string;
  feature_slugs: string[];
  raw: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const CORE_CLASSES = new Set([
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
  'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
]);

const CLASS_FILES = [
  'class-barbarian.json', 'class-bard.json', 'class-cleric.json',
  'class-druid.json', 'class-fighter.json', 'class-monk.json',
  'class-paladin.json', 'class-ranger.json', 'class-rogue.json',
  'class-sorcerer.json', 'class-warlock.json', 'class-wizard.json',
];

const PROF_BONUS_TABLE: Record<number, number> = {
  1: 2, 2: 2, 3: 2, 4: 2,
  5: 3, 6: 3, 7: 3, 8: 3,
  9: 4, 10: 4, 11: 4, 12: 4,
  13: 5, 14: 5, 15: 5, 16: 5,
  17: 6, 18: 6, 19: 6, 20: 6,
};

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function loadClassFile(filename: string): {
  class: FiveToolsClass[];
  [key: string]: unknown;
} {
  const filePath = path.resolve(process.cwd(), `../5etools-src/data/class/${filename}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getSpellSlotsAtLevel(
  spellSlots: number[][] | null,
  levelIndex: number,
): Record<string, number> | null {
  if (!spellSlots || !spellSlots[levelIndex]) return null;
  const slots = spellSlots[levelIndex];
  const result: Record<string, number> = {};
  const labels = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] > 0) {
      result[labels[i]] = slots[i];
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function countAsiUpToLevel(
  classFeatures: FiveToolsClass['classFeatures'],
  upToLevel: number,
): number {
  if (!classFeatures) return 0;
  let count = 0;
  for (const cf of classFeatures) {
    const str = typeof cf === 'string' ? cf : cf.classFeature;
    if (!str.includes('Ability Score')) continue;
    const parts = str.split('|');
    const level = parseInt(parts[parts.length - 1], 10);
    if (level <= upToLevel) count++;
  }
  return count;
}

function getFeaturesAtLevel(
  classFeatures: FiveToolsClass['classFeatures'],
  level: number,
  className: string,
  classSource: string,
  srd52?: boolean,
): string[] {
  if (!classFeatures) return [];
  const buildSlug = (name: string, src: string, lvl: number, isSrd52?: boolean): string => {
    const suffix = `${className}-${lvl}`;
    return generateSlug(`${name} ${suffix}`, src, isSrd52);
  };

  const slugs: string[] = [];
  for (const cf of classFeatures) {
    const str = typeof cf === 'string' ? cf : cf.classFeature;
    const parts = str.split('|');
    const featureLevel = parseInt(parts[parts.length - 1], 10);
    if (featureLevel !== level) continue;

    const featureName = parts[0];
    const featureSource = parts.length >= 3 ? parts[2] : classSource;
    const featureSrd52 = featureSource === 'XPHB' || srd52;
    slugs.push(buildSlug(featureName, featureSource, level, featureSrd52));
  }
  return slugs;
}

function resolveSpellSlotProgression(tableGroups?: ClassTableGroup[]): number[][] | null {
  if (!tableGroups) return null;
  for (const group of tableGroups) {
    if (group.rowsSpellProgression) {
      return group.rowsSpellProgression;
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────────
// Main function
// ────────────────────────────────────────────────────────────────

export function transformLevels(): TransformedLevel[] {
  const results: TransformedLevel[] = [];

  for (const file of CLASS_FILES) {
    const data = loadClassFile(file);
    const classes = data.class ?? [];

    for (const cls of classes) {
      const nameLower = cls.name.toLowerCase();
      if (!CORE_CLASSES.has(nameLower)) continue;
      if (cls._copy) continue;

      const classSlug = generateSlug(cls.name, cls.source, cls.srd52);
      const spellSlots = resolveSpellSlotProgression(cls.classTableGroups);

      for (let level = 1; level <= 20; level++) {
        const slug = `${classSlug}-level-${level}`;
        const slots = getSpellSlotsAtLevel(spellSlots, level - 1);

        const spellcasting = slots
          ? { spell_slots: slots }
          : null;

        const featureSlugs = getFeaturesAtLevel(
          cls.classFeatures, level, cls.name, cls.source, cls.srd52,
        );

        results.push({
          slug,
          level,
          ability_score_bonuses: countAsiUpToLevel(cls.classFeatures, level),
          prof_bonus: PROF_BONUS_TABLE[level],
          spellcasting,
          class_specific: null,
          class_slug: classSlug,
          source_code: cls.source,
          feature_slugs: featureSlugs,
          raw: {
            class: cls.name,
            source: cls.source,
            level,
            spell_slots: slots,
          },
        });
      }
    }
  }

  return results;
}
