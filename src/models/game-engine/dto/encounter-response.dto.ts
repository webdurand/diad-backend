import { EncounterEntity } from 'src/entities/encounter.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';

/**
 * Spec 006 — Response DTO para GET /encounters/:id.
 * Enriquece a entity com campos computados e derivados.
 */

export interface EnrichedParticipantResponse {
  id: string;
  encounterId: string;
  type: 'pc' | 'monster' | 'npc';
  characterId: string | null;
  monsterId: string | null;
  displayName: string;
  faction: string;

  currentHp: number;
  maxHp: number;
  tempHp: number;
  armorClass: number;
  speed: number;

  initiativeRoll: number | null;
  initiativeModifier: number | null;
  initiativeTotal: number | null;

  actionUsed: boolean;
  bonusActionUsed: boolean;
  movementRemaining: number | null;
  reactionsUsed: number;
  attacksUsedThisTurn: number;
  attacksMaxThisTurn: number;

  dodging: boolean;
  helping: boolean;
  helpingAlly: string | null;
  helpingAgainst: string | null;

  concentration: {
    spellSlug: string;
    saveDc: number;
    roundsRemaining: number | null;
  } | null;

  grappledBy: string | null;

  effectInstances: unknown[];
  appliedEffects: unknown[];
  conditionInstances: unknown[];
  conditions: string[];

  isDefeated: boolean;
  dyingState: string;
  isVisible: boolean;
  controlledBy: 'pc' | 'ai' | 'dm';

  positionX: number | null;
  positionY: number | null;

  recklessAttackActive: boolean;
  readiedAction: unknown | null;

  legendaryPointsAvailable: number | null;
  legendaryPointsMax: number | null;
}

export interface EnrichedEncounterResponse {
  id: string;
  sessionId: string;
  name: string;
  status: string;

  roundNumber: number;
  turnNumber: number;
  currentTurnParticipantId: string | null;
  turnOrder: string[];

  inLair: boolean;
  difficulty: unknown | null;
  mapData: unknown;

  participants: EnrichedParticipantResponse[];

  createdAt: string;
  updatedAt: string;
}

/**
 * Mapeia um participant entity (já enriquecido pelo enrichPcParticipants) para DTO.
 */
function mapParticipant(p: EncounterParticipantEntity): EnrichedParticipantResponse {
  const pAny = p as any;

  // Normalize controlledBy (safety: pre-migration rows might still have 'human')
  let controlledBy: 'pc' | 'ai' | 'dm' = p.controlledBy;
  if ((controlledBy as string) === 'human') controlledBy = 'pc';

  return {
    id: p.id,
    encounterId: p.encounterId,
    type: p.type as 'pc' | 'monster' | 'npc',
    characterId: p.characterId ?? null,
    monsterId: p.monsterId ?? null,
    displayName: p.displayName,
    faction: p.faction,

    // HP/AC/Speed — enriched from sheet for PCs, from entity for monsters
    currentHp: pAny.currentHp ?? p.currentHp ?? 0,
    maxHp: pAny.maxHp ?? p.maxHp ?? 0,
    tempHp: p.tempHp ?? 0,
    armorClass: pAny.armorClass ?? 10,
    speed: pAny.speed ?? 30,

    initiativeRoll: p.initiativeRoll ?? null,
    initiativeModifier: pAny.initiativeModifier ?? p.initiativeModifier ?? null,
    initiativeTotal: p.initiativeTotal ?? null,

    actionUsed: p.actionUsed ?? false,
    bonusActionUsed: p.bonusActionUsed ?? false,
    movementRemaining: p.movementRemaining ?? null,
    reactionsUsed: p.reactionsUsed ?? 0,
    attacksUsedThisTurn: p.attacksUsedThisTurn ?? 0,
    attacksMaxThisTurn: p.attacksMaxThisTurn ?? 1,

    // Derived booleans
    dodging: p.dodgingUntilTurnOfParticipantId != null,
    helping: p.helpingAllyParticipantId != null,
    helpingAlly: p.helpingAllyParticipantId ?? null,
    helpingAgainst: p.helpingTargetParticipantId ?? null,

    // Concentration object
    concentration: p.isConcentrating && p.concentratingOn
      ? {
          spellSlug: p.concentratingOn,
          saveDc: p.concentrationSaveDc ?? 10,
          roundsRemaining: p.concentrationRoundsRemaining ?? null,
        }
      : null,

    grappledBy: p.grappledByParticipantId ?? null,

    effectInstances: p.effectInstances ?? [],
    appliedEffects: p.appliedEffects ?? [],
    conditionInstances: p.conditionInstances ?? [],
    conditions: p.conditions ?? [],

    isDefeated: p.isDefeated ?? false,
    dyingState: p.dyingState ?? 'none',
    isVisible: p.isVisible ?? true,
    controlledBy,

    positionX: p.positionX ?? null,
    positionY: p.positionY ?? null,

    recklessAttackActive: p.recklessAttackActive ?? false,
    readiedAction: p.readiedAction ?? null,

    legendaryPointsAvailable: p.legendaryPointsAvailable ?? null,
    legendaryPointsMax: p.legendaryPointsMax ?? null,
  };
}

/**
 * Mapeia um encounter entity (com participants enriquecidos) para response DTO.
 */
export function toEnrichedEncounterResponse(
  encounter: EncounterEntity,
): EnrichedEncounterResponse {
  const isActive = encounter.status !== 'preparing';
  const turnOrder = encounter.turnOrder ?? [];
  const currentTurnIndex = encounter.currentTurnIndex ?? 0;

  return {
    id: encounter.id,
    sessionId: encounter.sessionId,
    name: encounter.name,
    status: encounter.status,

    roundNumber: isActive ? (encounter.currentRound ?? 1) : 0,
    turnNumber: isActive ? currentTurnIndex + 1 : 0,
    currentTurnParticipantId: isActive
      ? (turnOrder[currentTurnIndex] ?? null)
      : null,
    turnOrder,

    inLair: encounter.inLair ?? false,
    difficulty: encounter.difficulty ?? null,
    mapData: encounter.mapData ?? {},

    participants: (encounter.participants ?? []).map(mapParticipant),

    createdAt: encounter.createdAt instanceof Date
      ? encounter.createdAt.toISOString()
      : String(encounter.createdAt ?? ''),
    updatedAt: encounter.updatedAt instanceof Date
      ? encounter.updatedAt.toISOString()
      : String(encounter.updatedAt ?? ''),
  };
}
