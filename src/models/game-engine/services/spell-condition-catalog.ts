/**
 * Spec 005 Addendum — Spell Condition Catalog.
 *
 * Spells que aplicam ConditionInstance no alvo via saving throw.
 * O DB seed não contém mapping spell→condition (Hold Person não declara
 * "paralyzed", Web não declara "restrained", etc.). Este catálogo
 * hardcoda o mapping RAW.
 *
 * Consumido por castSpellInCombat após o bloco de damage: para cada target,
 * se entry encontrada, rola save e aplica ConditionInstance via
 * ConditionLifecycleService.
 */
import type {
  ConditionSlug,
  SaveAbility,
  RepeatSaveTiming,
} from '../interfaces/combat.interfaces';

export interface SpellConditionEntry {
  conditionSlug: ConditionSlug;
  saveAbility: SaveAbility;
  /** Duração em rounds (10 rounds ≈ 1 minuto). */
  durationRounds: number;
  requiresConcentration: boolean;
  repeatSaveTiming: RepeatSaveTiming;
}

export const SPELL_CONDITION_CATALOG: Record<string, SpellConditionEntry> = {
  'hold-person': {
    conditionSlug: 'paralyzed',
    saveAbility: 'wis',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'end_of_turn',
  },
  'hold-monster': {
    conditionSlug: 'paralyzed',
    saveAbility: 'wis',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'end_of_turn',
  },
  'web': {
    conditionSlug: 'restrained',
    saveAbility: 'dex',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'end_of_turn',
  },
  'dominate-monster': {
    conditionSlug: 'charmed',
    saveAbility: 'wis',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'never',
  },
  'dominate-person': {
    conditionSlug: 'charmed',
    saveAbility: 'wis',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'never',
  },
  'hypnotic-pattern': {
    conditionSlug: 'incapacitated',
    saveAbility: 'wis',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'never',
  },
  'fear': {
    conditionSlug: 'frightened',
    saveAbility: 'wis',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'end_of_turn',
  },
  'command': {
    conditionSlug: 'charmed',
    saveAbility: 'wis',
    durationRounds: 1,
    requiresConcentration: false,
    repeatSaveTiming: 'never',
  },
  'polymorph': {
    conditionSlug: 'incapacitated',
    saveAbility: 'wis',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'never',
  },
  'maze': {
    conditionSlug: 'incapacitated',
    saveAbility: 'int',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'end_of_turn',
  },
  'banishment': {
    conditionSlug: 'incapacitated',
    saveAbility: 'cha',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'never',
  },
  'blindness-deafness': {
    conditionSlug: 'blinded',
    saveAbility: 'con',
    durationRounds: 10,
    requiresConcentration: false,
    repeatSaveTiming: 'end_of_turn',
  },
  'sleep': {
    conditionSlug: 'unconscious',
    saveAbility: 'wis',
    durationRounds: 10,
    requiresConcentration: false,
    repeatSaveTiming: 'never',
  },
  'suggestion': {
    conditionSlug: 'charmed',
    saveAbility: 'wis',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'never',
  },
  'tashas-hideous-laughter': {
    conditionSlug: 'incapacitated',
    saveAbility: 'wis',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'end_of_turn',
  },
  'entangle': {
    conditionSlug: 'restrained',
    saveAbility: 'str',
    durationRounds: 10,
    requiresConcentration: true,
    repeatSaveTiming: 'end_of_turn',
  },
};

/**
 * Retorna a condição que a spell aplica via saving throw, ou null se a spell
 * não está mapeada neste catálogo (sem bloqueio do cast).
 */
export function getSpellCondition(
  spellSlug: string,
): SpellConditionEntry | null {
  return SPELL_CONDITION_CATALOG[spellSlug.toLowerCase()] ?? null;
}
