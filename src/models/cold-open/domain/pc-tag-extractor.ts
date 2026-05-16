import type { PCPersona } from "src/models/characters/dto/pc-persona.dto";

const CASTER_CLASSES = new Set([
  "bard",
  "cleric",
  "druid",
  "sorcerer",
  "warlock",
  "wizard",
  "paladin",
  "ranger",
]);

const MARTIAL_CLASSES = new Set([
  "barbarian",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
]);

function slugify(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || null;
}

function pushTag(tags: string[], value: string | null | undefined): void {
  if (value && !tags.includes(value)) tags.push(value);
}

function textIncludes(value: string | undefined, words: string[]): boolean {
  if (!value) return false;
  const text = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return words.some((word) => text.includes(word));
}

export function extractPcTags(persona: PCPersona): string[] {
  const tags: string[] = [];
  const classTag = slugify(persona.class);
  const raceTag = slugify(persona.race);
  const backgroundTag = slugify(persona.background);

  pushTag(tags, classTag);
  if (classTag && CASTER_CLASSES.has(classTag)) pushTag(tags, "caster");
  if (classTag && MARTIAL_CLASSES.has(classTag)) pushTag(tags, "martial");
  pushTag(tags, raceTag ? `race:${raceTag}` : null);
  pushTag(tags, backgroundTag ? `background:${backgroundTag}` : null);

  if (backgroundTag && ["sage", "acolyte", "investigator", "hermit"].includes(backgroundTag)) {
    pushTag(tags, "scholar");
  }
  if (backgroundTag && ["criminal", "charlatan", "urchin"].includes(backgroundTag)) {
    pushTag(tags, "background:criminal");
  }
  if (textIncludes(persona.personality.bond, ["mentor", "mestre", "teacher"])) {
    pushTag(tags, "bond:mentor");
  }
  if (textIncludes(persona.personality.bond, ["amor", "love", "amante"])) {
    pushTag(tags, "bond:lost-love");
  }
  if (textIncludes(persona.personality.ideal, ["reden", "redemption", "perdao"])) {
    pushTag(tags, "ideal:redemption");
  }
  if (textIncludes(persona.personality.flaw, ["obsess", "obsessao", "forbidden", "proib"])) {
    pushTag(tags, "flaw:obsession");
  }
  if (textIncludes(persona.personality.flaw, ["gananc", "greed", "ouro"])) {
    pushTag(tags, "flaw:greed");
  }
  if (persona.currentHpPercent <= 25) pushTag(tags, "wounded");

  return tags;
}
