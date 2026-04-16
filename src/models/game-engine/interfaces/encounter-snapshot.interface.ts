import type { ReadiedAction, TurnActionBlock } from './combat.interfaces';

/**
 * Spec 003: representação auto-contida do encontro para consumo de IA ou
 * auditoria externa. Retornada por `GET /encounters/:id/snapshot`.
 *
 * Contém todos os dados necessários para a IA decidir o turno sem chamadas
 * adicionais: posições, HP, conditions, action economy, distâncias, visibilidade
 * e ações disponíveis.
 */
export interface EncounterSnapshot {
  encounterId: string;
  round: number;
  currentTurnParticipantId: string;
  participants: SnapshotParticipant[];
  map?: EncounterMapSnapshot;
  generatedAt: string;
}

export interface SnapshotParticipant {
  id: string;
  type: 'pc' | 'monster' | 'npc';
  faction: 'ally' | 'enemy' | 'neutral';
  displayName: string;
  controlledBy: 'pc' | 'ai' | 'dm';
  position: { x: number; y: number };
  hp: { current: number; max: number; tempHp?: number };
  dyingState: 'none' | 'dying' | 'stable' | 'dead';
  conditions: string[];
  actionEconomy: {
    actionUsed: boolean;
    bonusUsed: boolean;
    movementRemaining: number;
    movementMax: number;
    reactionUsed: boolean;
  };
  dodgingUntilTurnOfParticipantId: string | null;
  helpingAllyParticipantId: string | null;
  helpingTargetParticipantId: string | null;
  readiedAction: ReadiedAction | null;
  hidden: boolean;
  statblockRef?: { monsterSlug: string };
  availableActions: TurnActionBlock[];
  /** id → distância em pés (tiles × 5ft). */
  distances: Record<string, number>;
  /** id → visibilidade. Modelo simples nesta spec (todos visíveis por default);
   * sight system completo fica pra spec 005. */
  canSee: Record<string, boolean>;
}

export interface EncounterMapSnapshot {
  width: number;
  height: number;
  /** Opcional; formato depende do `EncounterEntity.map` existente. */
  tiles?: unknown;
}
