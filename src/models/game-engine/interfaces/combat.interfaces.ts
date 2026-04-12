import { DiceResult, AdvantageResult } from './dice.interfaces';

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
  successes: number;
  failures: number;
  stabilized: boolean;
  dead: boolean;
  revivedHp?: number;
}

export interface TurnInfo {
  encounterId: string;
  round: number;
  participantId: string;
  participantName: string;
  participantType: 'pc' | 'monster' | 'npc';
  isDefeated: boolean;
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

export interface TurnActionBlock {
  id: string;
  name: string;
  timing: string;
  source: string;
  sourceLabel: string;
  description: string;
  attackBonus?: number;
  damage?: { dice: string; type: string; bonus?: number };
  range?: string;
  spellLevel?: number;
  requiresConcentration?: boolean;
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
