import type { ReadiedAction, TurnActionBlock } from "./combat.interfaces";

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
  /** Spec 013 — efeitos de chão ativos (Grease, Wall of Fire, Spike Growth, etc.). */
  tileEffects?: TileEffectSnapshot[];
  generatedAt: string;
}

/**
 * Spec 013 — snapshot de tile-effect ativo.
 *
 * Princípio X 3 camadas: RAW (kind/triggers/saveDc), tactical (consumido por
 * CombatAgent influence-map), narrativeDescriptor (consumido por Narrator).
 */
export interface TileEffectSnapshot {
  id: string;
  encounterId: string;
  sourceSpellSlug: string;
  sourceParticipantId: string | null;
  effectKind: string | null;
  shapeKind: "sphere" | "cube" | "cylinder" | "line" | "cone";
  originCell: { x: number; y: number };
  radiusCells: number;
  durationRoundsRemaining: number | null;
  saveDc: number | null;
  saveAbility: string | null;
  isDifficultTerrain: boolean;
  speedMultiplier: number | null;
  sourceConcentration: boolean;
  auraFollowsCaster: boolean;
  narrativeDescriptor: string | null;
  /** Camada 2 (Princípio X) — tags + tacticalValue + beneficiaryFaction. */
  tactical: unknown | null;
  /** Cells expandidas pela geometria (frontend renderer). */
  cells: Array<{ x: number; y: number }>;
  affectingParticipantIds: string[];
}

export interface SnapshotParticipant {
  id: string;
  type: "pc" | "monster" | "npc";
  faction: "ally" | "enemy" | "neutral";
  displayName: string;
  controlledBy: "pc" | "ai" | "dm";
  position: { x: number; y: number };
  /** Spec 013 — flat aliases pra harness/probes que esperam shape simples. */
  positionX: number;
  positionY: number;
  hp: { current: number; max: number; tempHp?: number };
  dyingState: "none" | "dying" | "stable" | "dead";
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
  /** Spec 013 — concentração ativa (probes/AI consomem). */
  isConcentrating: boolean;
  concentratingOn: string | null;
  // Spec 027 (M2 follow-up) — agno `_pick_best_attack` consulta `actions`
  // pra resolver nome real (vs literal "attack" que backend não acha).
  // `intelligence`/`wisdom` gateiam motor de decisão (rule/utility/LLM).
  statblockRef?: {
    monsterSlug: string;
    actions?: unknown[];
    intelligence?: number;
    wisdom?: number;
    /** Spec 027 (M2 follow-up) — walk speed em pés (default 30). agno usa
     * pra movement planner saber até onde mover pra entrar em range. */
    speed?: number;
  };
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
