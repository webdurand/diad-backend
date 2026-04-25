export interface DiceResult {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  dropped?: number[];
}

export interface AdvantageResult {
  roll1: number;
  roll2: number;
  chosen: number;
  discarded: number;
}

export interface InitiativeResult {
  roll: number;
  modifier: number;
  total: number;
}

/**
 * Spec 016 P2 — Active dice check exposto ao frontend (SSE chunk).
 * targetD20 = max(2, dc - totalModifier). Mín 2 (always-fail nat 1),
 * máx 30 (impossível). Passive checks NUNCA emitem este payload.
 */
export type DiceRollKind =
  | 'ability_check'
  | 'saving_throw'
  | 'attack_roll'
  | 'death_save';

export type DiceRollAdvantage = 'normal' | 'advantage' | 'disadvantage';

export type DiceVerdict =
  | 'success'
  | 'failure'
  | 'crit_success'
  | 'crit_failure';

export interface DiceModifierBreakdown {
  label: string;
  value: number;
}

export interface DiceRollRequest {
  rollId: string;
  characterId?: string;
  kind: DiceRollKind;
  ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  skill: string | null;
  dc: number;
  advantage: DiceRollAdvantage;
  modifiers: DiceModifierBreakdown[];
  totalModifier: number;
  targetD20: number;
  narrativeFraming?: string;
}

export interface DiceRollResolved {
  rollId: string;
  rawD20: number;
  rawD20Disadv: number | null;
  total: number;
  verdict: DiceVerdict;
}
