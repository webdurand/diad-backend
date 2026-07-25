
import type {
  ConditionSlug,
  SaveAbility,
  RepeatSaveTiming,
} from "../interfaces/combat.interfaces";

export interface SpellConditionEntry {
  conditionSlug: ConditionSlug;
  saveAbility: SaveAbility;

  durationRounds: number;
  requiresConcentration: boolean;
  repeatSaveTiming: RepeatSaveTiming;
}

const SPELL_CONDITION_CATALOG: Record<string, SpellConditionEntry> = {
  "hold-person": {
    conditionSlug: "paralyzed",
    saveAbility: "wis",
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: "end_of_turn",
  },
  "hold-monster": {
    conditionSlug: "paralyzed",
    saveAbility: "wis",
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: "end_of_turn",
  },
  web: {
    conditionSlug: "restrained",
    saveAbility: "dex",
    durationRounds: 600,
    requiresConcentration: true,
    repeatSaveTiming: "never",
  },
  "dominate-monster": {
    conditionSlug: "charmed",
    saveAbility: "wis",
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: "never",
  },
  "dominate-person": {
    conditionSlug: "charmed",
    saveAbility: "wis",
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: "never",
  },
  "hypnotic-pattern": {
    conditionSlug: "hypnotized",
    saveAbility: "wis",
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: "never",
  },
  fear: {
    conditionSlug: "frightened",
    saveAbility: "wis",
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: "end_of_turn",
  },
  command: {
    conditionSlug: "charmed",
    saveAbility: "wis",
    durationRounds: 1,
    requiresConcentration: false,
    repeatSaveTiming: "never",
  },


  maze: {
    conditionSlug: "incapacitated",
    saveAbility: "int",
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: "end_of_turn",
  },
  polymorph: {
    conditionSlug: "incapacitated",
    saveAbility: "wis",
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: "never",
  },
  banishment: {
    conditionSlug: "banished",
    saveAbility: "cha",
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: "never",
  },
  "blindness-deafness": {
    conditionSlug: "blinded",
    saveAbility: "con",
    durationRounds: 10,
    requiresConcentration: false,
    repeatSaveTiming: "end_of_turn",
  },
  sunburst: {
    conditionSlug: "blinded",
    saveAbility: "con",
    durationRounds: 10,
    requiresConcentration: false,
    repeatSaveTiming: "end_of_turn",
  },
  "storm-of-vengeance": {
    conditionSlug: "deafened",
    saveAbility: "con",
    durationRounds: 50,
    requiresConcentration: false,
    repeatSaveTiming: "never",
  },
  sleep: {
    conditionSlug: "incapacitated",
    saveAbility: "wis",
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: "end_of_turn",
  },
  suggestion: {
    conditionSlug: "charmed",
    saveAbility: "wis",
    durationRounds: 4_800,
    requiresConcentration: true,
    repeatSaveTiming: "never",
  },
  "tashas-hideous-laughter": {
    conditionSlug: "incapacitated",
    saveAbility: "wis",
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: "end_of_turn",
  },
  entangle: {
    conditionSlug: "restrained",
    saveAbility: "str",
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: "end_of_turn",
  },
};


export function getSpellCondition(
  spellSlug: string,
): SpellConditionEntry | null {
  return SPELL_CONDITION_CATALOG[spellSlug.toLowerCase()] ?? null;
}
