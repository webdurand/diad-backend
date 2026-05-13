import * as fs from "fs";
import * as path from "path";
import { generateSlug } from "./slug-generator";
import { parseEntries } from "./entries-parser";
import { SIZE_MAP, ABILITY_MAP } from "./code-maps";





interface FiveToolsRace {
  name: string;
  source: string;
  page?: number;
  edition?: string;
  srd52?: boolean;
  basicRules?: boolean;
  basicRules2024?: boolean;
  size?: string[];
  speed?:
    | number
    | {
        walk?: number;
        fly?: number | boolean;
        swim?: number | boolean;
        climb?: number | boolean;
        burrow?: number | boolean;
      };
  darkvision?: number;
  ability?: Record<string, number>[];
  entries?: unknown[];
  languageProficiencies?: Record<string, unknown>[];
  resist?: unknown[];
  creatureTypes?: string[];
  additionalSpells?: unknown[];
  traitTags?: string[];
  lineage?: string;
  reprintedAs?: string[];
  hasFluff?: boolean;
  hasFluffImages?: boolean;
  _copy?: { name: string; source: string };
  _versions?: unknown[];
  sizeEntry?: unknown;
  soundClip?: unknown;
  age?: { max?: number };
  [key: string]: unknown;
}

interface FiveToolsSubrace {
  name?: string;
  source: string;
  raceName?: string;
  raceSource?: string;
  page?: number;
  ability?: Record<string, number>[];
  darkvision?: number;
  entries?: unknown[];
  overwrite?: string;
  resist?: unknown;
  languageProficiencies?: Record<string, unknown>[];
  traitTags?: string[];
  additionalSpells?: unknown[];
  _copy?: unknown;
  _versions?: unknown[];
  srd?: boolean;
  srd52?: boolean;
  [key: string]: unknown;
}





export interface TransformedAbilityBonus {
  ability_score: { slug: string; name: string };
  bonus: number;
}

export interface TransformedRace {
  slug: string;
  name: string;
  speed: number;
  ability_bonuses: TransformedAbilityBonus[];
  age: string;
  size: string;
  size_description: string;
  language_options: Record<string, unknown> | null;
  language_desc: string;
  ability_bonus_options: Record<string, unknown> | null;
  alignment: string;
  source_code: string;
  language_slugs: string[];
  raw: Record<string, unknown>;
}

export interface TransformedSubrace {
  slug: string;
  name: string;
  description: string;
  ability_bonuses: TransformedAbilityBonus[];
  race_slug: string;
  source_code: string;
  trait_entries: { name: string; description: string[] }[];
  raw: Record<string, unknown>;
}

export interface RaceTraitEntry {
  name: string;
  description: string[];
}





function resolveSpeed(speed: FiveToolsRace["speed"]): number {
  if (typeof speed === "number") return speed;
  if (typeof speed === "object" && speed !== null) return speed.walk ?? 30;
  return 30;
}

function resolveSize(sizeArr?: string[]): string {
  if (!sizeArr || sizeArr.length === 0) return "Medium";
  if (sizeArr.length === 1) return SIZE_MAP[sizeArr[0]] ?? "Medium";
  return sizeArr.map((s) => SIZE_MAP[s] ?? s).join(" or ");
}

function resolveSizeDescription(race: FiveToolsRace): string {
  if (race.sizeEntry && typeof race.sizeEntry === "object") {
    const se = race.sizeEntry as { entries?: unknown[] };
    if (se.entries) return parseEntries(se.entries as any[]).join(" ");
  }
  const size = resolveSize(race.size);
  return `Your size is ${size}.`;
}

function resolveAbilityBonuses(
  ability?: Record<string, number>[],
): TransformedAbilityBonus[] {
  if (!ability || ability.length === 0) return [];
  const result: TransformedAbilityBonus[] = [];
  for (const block of ability) {
    for (const [key, val] of Object.entries(block)) {
      if (key === "choose") continue;
      const fullName = ABILITY_MAP[key];
      if (!fullName) continue;
      result.push({
        ability_score: {
          slug: fullName,
          name: fullName.charAt(0).toUpperCase() + fullName.slice(1),
        },
        bonus: val,
      });
    }
  }
  return result;
}

function resolveAbilityBonusOptions(
  ability?: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (!ability) return null;
  for (const block of ability) {
    if (block.choose) return block.choose as Record<string, unknown>;
  }
  return null;
}



const RACE_LANGUAGES_2024: Record<string, string[]> = {
  dragonborn: ["common", "draconic"],
  dwarf: ["common", "dwarvish"],
  elf: ["common", "elvish"],
  gnome: ["common", "gnomish"],
  goliath: ["common", "giant"],
  halfling: ["common", "halfling"],
  human: ["common"],
  orc: ["common", "orc"],
  tiefling: ["common", "infernal"],
};

function resolveLanguages(
  langProfs?: Record<string, unknown>[],
  raceName?: string,
): { slugs: string[]; desc: string; options: Record<string, unknown> | null } {
  if (!langProfs || langProfs.length === 0) {

    const raceKey = raceName?.toLowerCase();
    if (raceKey && RACE_LANGUAGES_2024[raceKey]) {
      const slugs = RACE_LANGUAGES_2024[raceKey];
      const langNames = slugs.map(
        (s) => s.charAt(0).toUpperCase() + s.slice(1),
      );
      const desc = `You can speak, read, and write ${langNames.join(" and ")}.`;

      const options =
        raceKey === "human" ? { choose: 1, type: "languages" } : null;
      return { slugs, desc, options };
    }
    return {
      slugs: ["common"],
      desc: "You can speak, read, and write Common.",
      options: null,
    };
  }

  const slugs: string[] = [];
  let options: Record<string, unknown> | null = null;

  for (const prof of langProfs) {
    for (const [key, val] of Object.entries(prof)) {
      if (key === "anyStandard" || key === "any") {
        options = { choose: val as number, type: "languages" };
      } else if (val === true) {
        slugs.push(key.toLowerCase());
      }
    }
  }

  if (slugs.length === 0) slugs.push("common");

  const langNames = slugs.map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  let desc = `You can speak, read, and write ${langNames.join(" and ")}.`;
  if (options) desc += ` You also know one additional language of your choice.`;

  return { slugs, desc, options };
}

function resolveAlignment(race: FiveToolsRace): string {
  if (race.lineage) return "Varies (player choice)";
  return "Varies";
}

function resolveAge(race: FiveToolsRace): string {
  if (race.age && typeof race.age === "object" && race.age.max) {
    return `Members of this race can live up to ${race.age.max} years.`;
  }
  return "Varies";
}

export function extractTraitEntries(entries?: unknown[]): RaceTraitEntry[] {
  if (!entries || entries.length === 0) return [];
  const traits: RaceTraitEntry[] = [];

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const obj = entry as { type?: string; name?: string; entries?: unknown[] };
    if (obj.type === "entries" && obj.name && obj.entries) {
      traits.push({
        name: obj.name,
        description: parseEntries(obj.entries as any[]),
      });
    }
  }
  return traits;
}





function loadRacesJson(): {
  race: FiveToolsRace[];
  subrace: FiveToolsSubrace[];
} {
  const filePath = path.resolve(
    process.cwd(),
    "../5etools-src/data/races.json",
  );
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function isImportableRace(race: FiveToolsRace): boolean {

  if (race._copy && !race.entries) return false;
  return true;
}

export function transformRaces(): TransformedRace[] {
  const data = loadRacesJson();
  const races = data.race ?? [];

  return races.filter(isImportableRace).map((race) => {
    const lang = resolveLanguages(race.languageProficiencies, race.name);

    return {
      slug: generateSlug(race.name, race.source, race.srd52),
      name: race.name,
      speed: resolveSpeed(race.speed),
      ability_bonuses: resolveAbilityBonuses(race.ability),
      age: resolveAge(race),
      size: resolveSize(race.size),
      size_description: resolveSizeDescription(race),
      language_options: lang.options,
      language_desc: lang.desc,
      ability_bonus_options: resolveAbilityBonusOptions(race.ability),
      alignment: resolveAlignment(race),
      source_code: race.source,
      language_slugs: lang.slugs,
      raw: race as Record<string, unknown>,
    };
  });
}

export function transformSubraces(): TransformedSubrace[] {
  const data = loadRacesJson();
  const subraces = data.subrace ?? [];

  return subraces
    .filter((s) => !s._copy && s.name)
    .map((sub) => {
      const parentSource = sub.raceSource ?? "PHB";
      const parentName = sub.raceName ?? "";
      const parentSrd52 = parentSource === "XPHB";
      const raceSlug = generateSlug(parentName, parentSource, parentSrd52);

      const traitEntries = extractTraitEntries(sub.entries);
      const descParts = traitEntries.map((t) => t.description.join(" "));

      return {
        slug: generateSlug(`${parentName} ${sub.name}`, sub.source, sub.srd52),
        name: sub.name!,
        description:
          descParts.join(" ") || `${sub.name} ${parentName} subrace.`,
        ability_bonuses: resolveAbilityBonuses(sub.ability),
        race_slug: raceSlug,
        source_code: sub.source,
        trait_entries: traitEntries,
        raw: sub as Record<string, unknown>,
      };
    });
}
