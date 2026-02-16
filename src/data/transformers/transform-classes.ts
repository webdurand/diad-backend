import * as fs from 'fs';
import * as path from 'path';
import { generateSlug } from './slug-generator';
import { stripTags } from './tag-stripper';
import { ABILITY_MAP } from './code-maps';

// ────────────────────────────────────────────────────────────────
// 5etools input types
// ────────────────────────────────────────────────────────────────

interface FiveToolsClass {
  name: string;
  source: string;
  page?: number;
  srd?: boolean;
  srd52?: boolean;
  edition?: string;
  hd: { number: number; faces: number };
  proficiency: string[];
  spellcastingAbility?: string;
  casterProgression?: string;
  preparedSpells?: string;
  preparedSpellsProgression?: number[];
  cantripProgression?: number[];
  spellsKnownProgressionFixed?: number[];
  spellsKnownProgressionFixedAllowLowerLevel?: boolean;
  primaryAbility?: Record<string, boolean>[];
  startingProficiencies?: {
    armor?: (string | Record<string, unknown>)[];
    weapons?: (string | Record<string, unknown>)[];
    tools?: (string | Record<string, unknown>)[];
    skills?: Array<{ choose?: { from: string[]; count: number } } | string>;
  };
  startingEquipment?: {
    additionalFromBackground?: boolean;
    default?: string[];
    defaultData?: unknown[];
    goldAlternative?: string;
    entries?: unknown[];
  };
  multiclassing?: {
    requirements?: Record<string, number>;
    proficienciesGained?: Record<string, unknown>;
  };
  classTableGroups?: ClassTableGroup[];
  classFeatures?: (string | { classFeature: string; gainSubclassFeature?: boolean })[];
  subclassTitle?: string;
  reprintedAs?: string[];
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

export interface TransformedClass {
  slug: string;
  name: string;
  hit_die: number;
  proficiency_choices: Record<string, unknown>;
  starting_equipment_options: Record<string, unknown> | null;
  multi_classing: Record<string, unknown>;
  spellcasting: Record<string, unknown> | null;
  cantrips_known: number;
  spells_prepared_count: number;
  spellbook_count: number;
  weapon_mastery_count: number;
  weapon_mastery_restriction: string | null;
  class_features_level_1: Record<string, unknown>[] | null;
  source_code: string;
  saving_throw_slugs: string[];
  proficiency_slugs: string[];
  spell_slot_progression: number[][] | null;
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

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function loadClassFile(filename: string): {
  class: FiveToolsClass[];
  subclass: unknown[];
  classFeature: unknown[];
  subclassFeature: unknown[];
} {
  const filePath = path.resolve(process.cwd(), `../5etools-src/data/class/${filename}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function resolveSkillChoices(
  skills?: Array<{ choose?: { from: string[]; count: number } } | string>,
): Record<string, unknown> {
  if (!skills || skills.length === 0) return {};

  for (const entry of skills) {
    if (typeof entry === 'object' && entry !== null && 'choose' in entry && entry.choose) {
      return {
        choose: entry.choose.count,
        from: entry.choose.from,
        type: 'skills',
      };
    }
  }
  return {};
}

function resolveStartingEquipment(
  eq?: FiveToolsClass['startingEquipment'],
): Record<string, unknown> | null {
  if (!eq) return null;
  return {
    additionalFromBackground: eq.additionalFromBackground ?? true,
    defaultData: eq.defaultData ?? null,
    default: eq.default?.map((d) => stripTags(d)) ?? null,
    goldAlternative: eq.goldAlternative ? stripTags(eq.goldAlternative) : null,
  };
}

function resolveMulticlassing(
  mc?: FiveToolsClass['multiclassing'],
): Record<string, unknown> {
  if (!mc) return {};
  const result: Record<string, unknown> = {};
  if (mc.requirements) {
    const reqs: Record<string, number> = {};
    for (const [key, val] of Object.entries(mc.requirements)) {
      const fullName = ABILITY_MAP[key] ?? key;
      reqs[fullName] = val;
    }
    result.requirements = reqs;
  }
  if (mc.proficienciesGained) {
    result.proficiencies_gained = mc.proficienciesGained;
  }
  return result;
}

function resolveSpellcasting(cls: FiveToolsClass): Record<string, unknown> | null {
  if (!cls.spellcastingAbility && !cls.casterProgression) return null;

  return {
    ability: cls.spellcastingAbility ? (ABILITY_MAP[cls.spellcastingAbility] ?? cls.spellcastingAbility) : null,
    caster_progression: cls.casterProgression ?? null,
    cantrip_progression: cls.cantripProgression ?? null,
    prepared_spells_progression: cls.preparedSpellsProgression ?? null,
    spellbook_progression: cls.spellsKnownProgressionFixed ?? null,
    prepared_formula: cls.preparedSpells ?? null,
  };
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

function resolveSavingThrows(proficiency: string[]): string[] {
  return proficiency.map((p) => ABILITY_MAP[p] ?? p);
}

function resolveProficiencySlugs(profs?: FiveToolsClass['startingProficiencies']): string[] {
  if (!profs) return [];
  const slugs: string[] = [];

  const toCleanString = (item: unknown): string => {
    if (typeof item === 'string') return stripTags(item).toLowerCase();
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;
      const name = obj.proficiency ?? obj.full ?? obj.name ?? '';
      return typeof name === 'string' ? name.toLowerCase() : '';
    }
    return '';
  };

  if (profs.armor) {
    for (const a of profs.armor) {
      const clean = toCleanString(a);
      if (clean.includes('light')) slugs.push('light-armor');
      else if (clean.includes('medium')) slugs.push('medium-armor');
      else if (clean.includes('heavy')) slugs.push('heavy-armor');
      else if (clean.includes('shield')) slugs.push('shields');
      else if (clean.includes('all')) {
        slugs.push('light-armor', 'medium-armor', 'heavy-armor', 'shields');
      }
    }
  }

  if (profs.weapons) {
    for (const w of profs.weapons) {
      const clean = toCleanString(w);
      if (clean.includes('simple')) slugs.push('simple-weapons');
      else if (clean.includes('martial')) slugs.push('martial-weapons');
    }
  }

  return slugs;
}

function resolveLevel1Features(
  classFeatures?: FiveToolsClass['classFeatures'],
): Record<string, unknown>[] | null {
  if (!classFeatures) return null;

  const level1: Record<string, unknown>[] = [];
  for (const cf of classFeatures) {
    const str = typeof cf === 'string' ? cf : cf.classFeature;
    const parts = str.split('|');
    const level = parseInt(parts[parts.length - 1], 10);
    if (level === 1) {
      level1.push({ name: parts[0], reference: str });
    }
  }
  return level1.length > 0 ? level1 : null;
}

function resolveWeaponMastery(cls: FiveToolsClass): { count: number; restriction: string | null } {
  const wm = cls.weaponMasteries as number | undefined;
  return {
    count: wm ?? 0,
    restriction: null,
  };
}

// ────────────────────────────────────────────────────────────────
// Main function
// ────────────────────────────────────────────────────────────────

export function transformClasses(): TransformedClass[] {
  const results: TransformedClass[] = [];

  for (const file of CLASS_FILES) {
    const data = loadClassFile(file);
    const classes = data.class ?? [];

    for (const cls of classes) {
      const nameLower = cls.name.toLowerCase();
      if (!CORE_CLASSES.has(nameLower)) continue;
      if (cls._copy) continue;

      const slug = generateSlug(cls.name, cls.source, cls.srd52);
      const spellSlots = resolveSpellSlotProgression(cls.classTableGroups);
      const wm = resolveWeaponMastery(cls);

      results.push({
        slug,
        name: cls.name,
        hit_die: cls.hd.faces,
        proficiency_choices: resolveSkillChoices(cls.startingProficiencies?.skills),
        starting_equipment_options: resolveStartingEquipment(cls.startingEquipment),
        multi_classing: resolveMulticlassing(cls.multiclassing),
        spellcasting: resolveSpellcasting(cls),
        cantrips_known: cls.cantripProgression?.[0] ?? 0,
        spells_prepared_count: cls.preparedSpellsProgression?.[0] ?? 0,
        spellbook_count: cls.spellsKnownProgressionFixed?.[0] ?? 0,
        weapon_mastery_count: wm.count,
        weapon_mastery_restriction: wm.restriction,
        class_features_level_1: resolveLevel1Features(cls.classFeatures),
        source_code: cls.source,
        saving_throw_slugs: resolveSavingThrows(cls.proficiency),
        proficiency_slugs: resolveProficiencySlugs(cls.startingProficiencies),
        spell_slot_progression: spellSlots,
        raw: cls as Record<string, unknown>,
      });
    }
  }

  return results;
}
