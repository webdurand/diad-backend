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
  classFeatures?: (
    | string
    | { classFeature: string; gainSubclassFeature?: boolean }
  )[];
  subclassTitle?: string;
  reprintedAs?: string[];
  weaponMasteries?: number;
  _copy?: unknown;
  [key: string]: unknown;
}

interface ClassTableGroup {
  title?: string;
  colLabels?: string[];
  rows?: number[][];
  rowsSpellProgression?: number[][];
}

interface FiveToolsClassFeature {
  name: string;
  source: string;
  className: string;
  classSource: string;
  level: number;
  entries?: unknown[];
  [key: string]: unknown;
}

// ────────────────────────────────────────────────────────────────
// Output types
// ────────────────────────────────────────────────────────────────

export interface ClassFeatureLevel1 {
  slug: string;
  name: string;
  type: 'passive' | 'choice' | 'feat_choice';
  description?: string;
  choices?: { slug: string; name: string; description: string }[];
  feat_filter?: string;
  invocation_count?: number;
}

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
  class_features_level_1: ClassFeatureLevel1[] | null;
  tool_choice: Record<string, unknown> | null;
  always_prepared_spells: { slug: string; name: string }[] | null;
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

  const abilityFull = cls.spellcastingAbility
    ? (ABILITY_MAP[cls.spellcastingAbility] ?? cls.spellcastingAbility)
    : null;

  return {
    ability: abilityFull,
    spellcasting_ability: abilityFull
      ? { slug: cls.spellcastingAbility, name: capitalize(abilityFull) }
      : null,
    caster_progression: cls.casterProgression ?? null,
    cantrip_progression: cls.cantripProgression ?? null,
    prepared_spells_progression: cls.preparedSpellsProgression ?? null,
    spellbook_progression: cls.spellsKnownProgressionFixed ?? null,
    prepared_formula: cls.preparedSpells ?? null,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  cls: FiveToolsClass,
  classFeatures: FiveToolsClassFeature[],
): ClassFeatureLevel1[] | null {
  if (!cls.classFeatures) return null;

  // Collect level 1 feature names from class definition
  const level1Refs: string[] = [];
  for (const cf of cls.classFeatures) {
    const str = typeof cf === 'string' ? cf : cf.classFeature;
    const parts = str.split('|');
    const level = parseInt(parts[parts.length - 1], 10);
    if (level === 1) level1Refs.push(parts[0]);
  }

  if (level1Refs.length === 0) return null;

  // Find matching feature entries from 5etools data
  const featureMap = new Map<string, FiveToolsClassFeature>();
  for (const feat of classFeatures) {
    if (
      feat.className === cls.name &&
      feat.classSource === cls.source &&
      feat.level === 1
    ) {
      featureMap.set(feat.name, feat);
    }
  }

  const classKey = cls.name.toLowerCase();
  const result: ClassFeatureLevel1[] = [];

  for (const featName of level1Refs) {
    const feat = featureMap.get(featName);
    const slug = toSlug(featName);
    const desc = feat ? extractFirstText(feat.entries) : undefined;

    // Determine feature type and enrich
    const enriched = enrichFeature(
      classKey,
      slug,
      featName,
      desc,
      feat,
      classFeatures,
    );
    result.push(enriched);
  }

  return result.length > 0 ? result : null;
}

function enrichFeature(
  classKey: string,
  slug: string,
  name: string,
  description: string | undefined,
  feat: FiveToolsClassFeature | undefined,
  allFeatures: FiveToolsClassFeature[],
): ClassFeatureLevel1 {
  // Fighting Style (Fighter) — feat_choice type
  if (name === 'Fighting Style' && classKey === 'fighter') {
    return {
      slug,
      name,
      type: 'feat_choice',
      description:
        description ??
        'You have honed your martial prowess and gain a Fighting Style feat of your choice.',
      feat_filter: 'fighting-style',
    };
  }

  // Divine Order (Cleric) — choice with sub-options
  if (name === 'Divine Order' && classKey === 'cleric') {
    return {
      slug,
      name,
      type: 'choice',
      choices: resolveSubChoices(feat, allFeatures),
    };
  }

  // Primal Order (Druid) — choice with sub-options
  if (name === 'Primal Order' && classKey === 'druid') {
    return {
      slug,
      name,
      type: 'choice',
      choices: resolveSubChoices(feat, allFeatures),
    };
  }

  // Eldritch Invocations (Warlock) — choice with invocation_count
  if (name === 'Eldritch Invocations' && classKey === 'warlock') {
    return {
      slug,
      name,
      type: 'choice',
      description:
        description ??
        'You have unearthed Eldritch Invocations, pieces of forbidden knowledge that imbue you with an abiding magical ability.',
      invocation_count: 1,
    };
  }

  // Expertise (Rogue) — choice
  if (slug === 'expertise' && classKey === 'rogue') {
    return {
      slug,
      name,
      type: 'choice',
      description:
        description ??
        'You gain Expertise in two of your skill proficiencies of your choice.',
    };
  }

  // Thieves' Cant (Rogue)
  if (slug === 'thieves-cant') {
    return {
      slug,
      name,
      type: 'passive',
      description:
        description ??
        "You know Thieves' Cant and one other language of your choice.",
    };
  }

  // Weapon Mastery — choice
  if (name === 'Weapon Mastery') {
    return { slug, name, type: 'choice', description };
  }

  // Everything else is passive
  return { slug, name, type: 'passive', description };
}

function resolveSubChoices(
  feat: FiveToolsClassFeature | undefined,
  allFeatures: FiveToolsClassFeature[],
): { slug: string; name: string; description: string }[] {
  if (!feat?.entries) return [];

  // Find refClassFeature references in entries
  const refs: string[] = [];
  findRefs(feat.entries, refs);

  const choices: { slug: string; name: string; description: string }[] = [];
  for (const ref of refs) {
    const parts = ref.split('|');
    const choiceName = parts[0];
    // Find the matching feature entry
    const choiceFeat = allFeatures.find(
      (f) =>
        f.name === choiceName &&
        f.className === feat.className &&
        f.classSource === feat.classSource &&
        f.level === feat.level,
    );
    choices.push({
      slug: toSlug(choiceName),
      name: choiceName,
      description: choiceFeat
        ? (extractFirstText(choiceFeat.entries) ?? '')
        : '',
    });
  }
  return choices;
}

function findRefs(entries: unknown[], refs: string[]): void {
  if (!Array.isArray(entries)) return;
  for (const e of entries) {
    if (typeof e === 'object' && e !== null) {
      const obj = e as Record<string, unknown>;
      if (
        obj.type === 'refClassFeature' &&
        typeof obj.classFeature === 'string'
      ) {
        refs.push(obj.classFeature);
      }
      if (Array.isArray(obj.entries)) findRefs(obj.entries, refs);
    }
  }
}

function extractFirstText(entries?: unknown[]): string | undefined {
  if (!entries) return undefined;
  for (const e of entries) {
    if (typeof e === 'string') return stripTags(e);
  }
  return undefined;
}

function toSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveToolChoice(
  cls: FiveToolsClass,
): Record<string, unknown> | null {
  const classKey = cls.name.toLowerCase();
  if (classKey === 'monk') {
    return {
      description:
        "Choose one type of Artisan's Tools or one Musical Instrument.",
      choose: 1,
      from_categories: ['artisans-tools', 'musical-instruments'],
    };
  }
  return null;
}

function resolveAlwaysPreparedSpells(
  cls: FiveToolsClass,
): { slug: string; name: string }[] | null {
  const classKey = cls.name.toLowerCase();
  if (classKey === 'ranger') {
    return [{ slug: 'hunters-mark', name: "Hunter's Mark" }];
  }
  return null;
}

function resolveWeaponMastery(cls: FiveToolsClass): { count: number; restriction: string | null } {
  const wm = cls.weaponMasteries as number | undefined;
  if (wm && wm > 0) return { count: wm, restriction: null };

  // Fallback: some XPHB classes define mastery via feature but not the field
  const classKey = cls.name.toLowerCase();
  const MASTERY_DEFAULTS: Record<
    string,
    { count: number; restriction: string | null }
  > = {
    barbarian: { count: 2, restriction: 'melee' },
    fighter: { count: 3, restriction: null },
    paladin: { count: 2, restriction: null },
    ranger: { count: 2, restriction: null },
    rogue: { count: 2, restriction: null },
  };
  return MASTERY_DEFAULTS[classKey] ?? { count: 0, restriction: null };
}

// ────────────────────────────────────────────────────────────────
// Main function
// ────────────────────────────────────────────────────────────────

export function transformClasses(): TransformedClass[] {
  const results: TransformedClass[] = [];

  for (const file of CLASS_FILES) {
    const data = loadClassFile(file);
    const classes = data.class ?? [];
    const classFeatures = (data.classFeature ?? []) as FiveToolsClassFeature[];

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
        proficiency_choices: resolveSkillChoices(
          cls.startingProficiencies?.skills,
        ),
        starting_equipment_options: resolveStartingEquipment(
          cls.startingEquipment,
        ),
        multi_classing: resolveMulticlassing(cls.multiclassing),
        spellcasting: resolveSpellcasting(cls),
        cantrips_known: cls.cantripProgression?.[0] ?? 0,
        spells_prepared_count: cls.preparedSpellsProgression?.[0] ?? 0,
        spellbook_count: cls.spellsKnownProgressionFixed?.[0] ?? 0,
        weapon_mastery_count: wm.count,
        weapon_mastery_restriction: wm.restriction,
        class_features_level_1: resolveLevel1Features(cls, classFeatures),
        tool_choice: resolveToolChoice(cls),
        always_prepared_spells: resolveAlwaysPreparedSpells(cls),
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
