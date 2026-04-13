import { DiceResult, AdvantageResult } from './dice.interfaces';
import type { AreaEffect } from 'src/shared/aoe-origin.types';

export interface AttackRollResult {
  roll: number;
  modifier: number;
  total: number;
  targetAc: number;
  hit: boolean;
  critical: boolean;
  criticalMiss: boolean;
  advantage?: AdvantageResult;
}

export interface DamageRollResult {
  rolls: DiceResult[];
  bonus: number;
  total: number;
  type: string;
  resisted: boolean;
  immune: boolean;
  vulnerable: boolean;
  finalDamage: number;
}

export interface AttackResult {
  attackRoll: AttackRollResult;
  damageRoll?: DamageRollResult;
  targetHpAfter?: number;
  targetDefeated: boolean;
  concentrationBroken?: boolean;
}

export interface SavingThrowResult {
  ability: string;
  dc: number;
  roll: number;
  modifier: number;
  total: number;
  success: boolean;
  advantage?: AdvantageResult;
}

export interface ConcentrationCheckResult {
  dc: number;
  roll: number;
  modifier: number;
  total: number;
  maintained: boolean;
  spellName?: string;
}

export interface DeathSaveResult {
  roll: number;
  naturalOne: boolean;
  naturalTwenty: boolean;
  successes: number;
  failures: number;
  /** Final dying state after this roll. */
  dyingState: 'none' | 'dying' | 'stable' | 'dead';
  /** Back-compat: `dyingState === 'stable'`. */
  stabilized: boolean;
  /** Back-compat: `dyingState === 'dead'`. */
  dead: boolean;
  /** Non-null only on natural 20 revival. */
  revivedHp: number | null;
}

export interface TurnInfo {
  encounterId: string;
  round: number;
  participantId: string;
  participantName: string;
  participantType: 'pc' | 'monster' | 'npc';
  isDefeated: boolean;
  /** Only meaningful for PCs; monsters are always 'none'. */
  dyingState?: 'none' | 'dying' | 'stable' | 'dead';
  /** True when turn was auto-skipped (stable PC); frontend should call /end-turn immediately. */
  autoSkip?: boolean;
}

export interface RoundInfo {
  encounterId: string;
  round: number;
  firstParticipantId: string;
}

export interface AttackModifiers {
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  autoFail: boolean;
  autoCrit: boolean;
}

export interface DefenseModifiers {
  attacksHaveAdvantage: boolean;
  attacksHaveDisadvantage: boolean;
  autoHit: boolean;
  autoCritIfMelee: boolean;
}

export interface SaveModifiers {
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  autoFail: boolean;
}

export interface ConditionTurnEffect {
  condition: string;
  effect: string;
  description: string;
}

// AoEShape re-exportado de shared/aoe-origin.types pra compat; preferir import direto de lá.
export type { AoEShape } from 'src/shared/aoe-origin.types';

export interface TurnActionBlock {
  id: string;
  name: string;
  timing: string;
  source: string;
  sourceLabel: string;
  description: string;
  /** Discriminator for aggregators — 'multiattack' | 'spell-opener' | undefined (regular). */
  kind?: 'multiattack' | 'spell-opener' | 'attack';
  attackBonus?: number;
  damage?: { dice: string; type: string; bonus?: number };
  range?: string;
  spellLevel?: number;
  requiresConcentration?: boolean;
  /** If set, action is area-of-effect. Inclui originType derivado pra decidir picker no frontend. */
  aoe?: AreaEffect;
  /** Saving throw if the action uses one. */
  save?: {
    ability: string;
    dc: number;
    halfOnSuccess?: boolean;
  };
  /** Multiattack aggregator: ordered list of sub-attacks. */
  sequence?: Array<{ actionName: string; count: number }>;
  /** Multiattack recharge gate (e.g. '5-6' on a breath weapon). null when always available. */
  rechargeRequired?: '5-6' | '6' | null;
}

export interface AoEResolveResult {
  affectedParticipantIds: string[];
  results: Array<{
    participantId: string;
    participantName: string;
    save?: SavingThrowResult;
    damageRoll?: DamageRollResult;
    targetHpAfter?: number;
    targetDefeated: boolean;
  }>;
}

export interface TurnActionsResult {
  participantId: string;
  participantName: string;
  participantType: 'pc' | 'monster' | 'npc';
  actions: TurnActionBlock[];
  bonusActions: TurnActionBlock[];
  reactions: TurnActionBlock[];
  canMove: boolean;
  remainingMovement: number;
  speed: number;
  actionUsed: boolean;
  bonusActionUsed: boolean;
  hasDisengaged: boolean;
  hasDashed: boolean;
}
