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

// ============================================================================
// Spec 003 — ações genéricas, estados de reação e orquestração de turno IA
// ============================================================================

/** Gatilho de Ready (PHB cap. 9). Spec 003 cobre apenas os 2 enums pré-definidos;
 * gatilhos textuais livres ("custom") ficam pra spec futura. */
export type ReadyTrigger =
  | { kind: 'enemy_enters_range'; rangeFt: number }
  | { kind: 'enemy_attacks_ally'; allyParticipantId: string };

/** Ação armada via Ready; dispara quando o gatilho ocorre, consumindo a reação. */
export interface ReadiedAction {
  trigger: ReadyTrigger;
  actionDescriptor: PlannedActionStep;
  armedAtTurnOfParticipantId: string;
}

/** Efeito ativo de Help — o próximo ataque de `allyParticipantId` contra
 * `targetParticipantId` tem vantagem, até o próximo turno do ajudante. */
export interface HelpingState {
  allyParticipantId: string;
  targetParticipantId: string;
  expiresAtNextTurnOfParticipantId: string;
}

/** Discriminated union — planos emitidos pelo `AiTurnExecutor` antes da execução. */
export type PlannedActionStep =
  | { kind: 'move'; to: { x: number; y: number } }
  | { kind: 'attack'; actionName: string; targetParticipantIds: string[] }
  | {
      kind: 'cast-spell';
      spellSlug: string;
      slotLevel?: number;
      targetParticipantIds?: string[];
      point?: { x: number; y: number };
    }
  | { kind: 'dodge' }
  | { kind: 'dash' }
  | { kind: 'disengage' }
  | { kind: 'help'; allyParticipantId: string; targetParticipantId: string }
  | { kind: 'hide' }
  | { kind: 'ready'; trigger: ReadyTrigger; readiedAction: PlannedActionStep }
  | { kind: 'search'; ability: 'perception' | 'investigation' }
  | {
      kind: 'use-object';
      objectRef: { source: 'inventory' | 'environment'; slug: string };
    }
  | { kind: 'end-turn' };

/** Resultado de um step executado, com descritor do evento gerado. */
export interface ActionStep {
  kind: PlannedActionStep['kind'];
  payload: Record<string, unknown>;
  result: {
    ok: boolean;
    summary: string;
    events: Array<{ type: string; [k: string]: unknown }>;
    error?: { code: string; message: string };
  };
  timestamp: string;
}

/** Resposta completa de `POST /ai-turn` após aplicar todos os steps. */
export interface TurnExecutionResult {
  steps: ActionStep[];
  finalState: {
    actionUsed: boolean;
    bonusUsed: boolean;
    movementRemaining: number;
    reactionUsed: boolean;
    hp: { current: number; max: number };
    conditions: string[];
    dyingState: 'none' | 'dying' | 'stable' | 'dead';
  };
  llmCostUsd?: number;
  tookMs: number;
  rationale?: string;
}
