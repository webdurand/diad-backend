import type {
  MonsterSpellcasting,
  MonsterKnownSpell,
  SpellSlotLevel,
  InnateUsage,
} from '../../models/game-engine/interfaces/monster-typed';

/**
 * Parses a monster's Spellcasting or Innate Spellcasting `special_ability`
 * block into a structured `MonsterSpellcasting`.
 *
 * Supported SRD patterns:
 *
 * **Standard spellcasting** (e.g. Archmage, Mage):
 *   "The archmage is an 18th-level spellcaster. Its spellcasting ability is
 *    Intelligence (spell save DC 18, +10 to hit with spell attacks). The
 *    archmage has the following wizard spells prepared:
 *      Cantrips (at will): fire bolt, light, mage hand, prestidigitation
 *      1st level (4 slots): detect magic, identify, mage armor, magic missile
 *      2nd level (3 slots): ...
 *   "
 *
 * **Innate spellcasting** (e.g. Dragons, certain Dragons):
 *   "The dragon's innate spellcasting ability is Charisma (spell save DC 21).
 *    It can innately cast the following spells, requiring no material components:
 *      At will: detect magic, scrying
 *      3/day each: fireball, lightning bolt
 *      1/day each: dominate person
 *   "
 *
 * Returns `null` when the block can't be parsed — caller should leave the row
 * NULL and the runtime will report the monster as having no spells.
 */

const ABILITY_MAP: Record<string, 'int' | 'wis' | 'cha'> = {
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
  int: 'int',
  wis: 'wis',
  cha: 'cha',
};

const SLOT_LEVELS: Record<string, SpellSlotLevel> = {
  cantrip: 0 as unknown as SpellSlotLevel,
  '1st': 1,
  '2nd': 2,
  '3rd': 3,
  '4th': 4,
  '5th': 5,
  '6th': 6,
  '7th': 7,
  '8th': 8,
  '9th': 9,
};

const INNATE_USAGE_MAP: Record<string, InnateUsage> = {
  'at will': 'at-will',
  'at-will': 'at-will',
  '1/day': '1/day',
  '2/day': '2/day',
  '3/day': '3/day',
};

/**
 * Very light spell-name → slug: lowercase, strip parentheticals, replace
 * non-alphanumerics with hyphens, collapse runs of hyphens, trim.
 */
function slugifySpellName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
}

export function parseSpellcastingFromSpecialAbilities(
  specialAbilities: unknown,
): MonsterSpellcasting | null {
  const abilities = Array.isArray(specialAbilities) ? specialAbilities : [];
  if (abilities.length === 0) return null;

  const innateAbility = abilities.find(
    (a: any) => typeof a?.name === 'string' && /innate\s+spellcasting/i.test(a.name),
  );
  if (innateAbility && typeof innateAbility.desc === 'string') {
    const parsed = parseInnate(innateAbility.desc);
    if (parsed) return parsed;
  }

  const standardAbility = abilities.find(
    (a: any) =>
      typeof a?.name === 'string' &&
      /spellcasting/i.test(a.name) &&
      !/innate/i.test(a.name),
  );
  if (standardAbility && typeof standardAbility.desc === 'string') {
    const parsed = parseStandard(standardAbility.desc);
    if (parsed) return parsed;
  }

  return null;
}

function parseStandard(desc: string): MonsterSpellcasting | null {
  const abilityMatch = desc.match(
    /spellcasting ability is\s+(\w+)/i,
  );
  const dcMatch = desc.match(/spell save DC\s+(\d+)/i);
  const attackMatch = desc.match(/([+-]?\d+)\s+to hit with spell attacks/i);
  const levelMatch = desc.match(/(\d+)(?:st|nd|rd|th)-level spellcaster/i);

  const abilityRaw = abilityMatch?.[1]?.toLowerCase();
  const ability = abilityRaw ? ABILITY_MAP[abilityRaw] : undefined;
  if (!ability || !dcMatch) return null;

  const saveDc = parseInt(dcMatch[1], 10);
  const attackBonus = attackMatch ? parseInt(attackMatch[1], 10) : saveDc - 8;
  const casterLevel = levelMatch ? parseInt(levelMatch[1], 10) : undefined;

  const slotsByLevel: Partial<Record<SpellSlotLevel, number>> = {};
  const knownSpells: MonsterKnownSpell[] = [];

  const lines = desc.split(/\n|\r/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const cantripMatch = line.match(/^cantrips\s*\([^)]*\):\s*(.+)$/i);
    if (cantripMatch) {
      for (const slug of extractSpellSlugs(cantripMatch[1])) {
        knownSpells.push({ slug, level: 0 });
      }
      continue;
    }

    const leveledMatch = line.match(
      /^(\d+)(?:st|nd|rd|th)\s+level\s*\((\d+)\s+slots?\):\s*(.+)$/i,
    );
    if (leveledMatch) {
      const level = parseInt(leveledMatch[1], 10) as SpellSlotLevel;
      const slots = parseInt(leveledMatch[2], 10);
      slotsByLevel[level] = slots;
      for (const slug of extractSpellSlugs(leveledMatch[3])) {
        knownSpells.push({ slug, level });
      }
    }
  }

  if (knownSpells.length === 0) return null;

  return {
    type: 'standard',
    ability,
    saveDc,
    attackBonus,
    casterLevel,
    slotsByLevel,
    knownSpells,
  };
}

function parseInnate(desc: string): MonsterSpellcasting | null {
  const abilityMatch = desc.match(
    /innate\s+spellcasting\s+ability\s+is\s+(\w+)/i,
  );
  const dcMatch = desc.match(/spell save DC\s+(\d+)/i);
  const attackMatch = desc.match(/([+-]?\d+)\s+to hit with spell attacks/i);

  const abilityRaw = abilityMatch?.[1]?.toLowerCase();
  const ability = abilityRaw ? ABILITY_MAP[abilityRaw] : undefined;
  if (!ability || !dcMatch) return null;

  const saveDc = parseInt(dcMatch[1], 10);
  const attackBonus = attackMatch ? parseInt(attackMatch[1], 10) : saveDc - 8;

  const knownSpells: MonsterKnownSpell[] = [];
  const dailyUses: Record<string, InnateUsage> = {};

  const lines = desc.split(/\n|\r/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const usageMatch = line.match(
      /^(at\s+will|[1-3]\/day(?:\s+each)?):\s*(.+)$/i,
    );
    if (!usageMatch) continue;

    const usageKey = usageMatch[1].toLowerCase().replace(/\s+each/, '').replace(/\s+/g, ' ');
    const usage = INNATE_USAGE_MAP[usageKey as keyof typeof INNATE_USAGE_MAP];
    if (!usage) continue;

    for (const slug of extractSpellSlugs(usageMatch[2])) {
      knownSpells.push({ slug, level: 0 });
      dailyUses[slug] = usage;
    }
  }

  if (knownSpells.length === 0) return null;

  return {
    type: 'innate',
    ability,
    saveDc,
    attackBonus,
    dailyUses,
    knownSpells,
  };
}

function extractSpellSlugs(raw: string): string[] {
  return raw
    .split(/,|;/)
    .map((s) => s.trim())
    .map((s) => s.replace(/\*+$/, '').trim())
    .filter(Boolean)
    .map(slugifySpellName)
    .filter(Boolean);
}

// re-export for tests that want to exercise slug behavior directly
export { slugifySpellName };
