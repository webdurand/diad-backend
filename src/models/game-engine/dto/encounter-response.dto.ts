import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";



export interface EnrichedParticipantResponse {
  id: string;
  encounterId: string;
  type: "pc" | "monster" | "npc";
  characterId: string | null;
  ownerUserId: string | null;
  monsterId: string | null;
  linkedCasterParticipantId: string | null;
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
  hasDashed: boolean;
  hasDisengaged: boolean;


  hasInspiration?: boolean;
  inspirationArmed: boolean;
  helping: boolean;
  helpingAlly: string | null;
  helpingAgainst: string | null;

  concentration: {
    spellSlug: string;
    saveDc: number;
    roundsRemaining: number | null;
  } | null;

  grappledBy: string | null;


  spellSlots: Array<{ level: number; total: number; used: number }>;

  effectInstances: unknown[];
  appliedEffects: unknown[];
  conditionInstances: unknown[];
  conditions: string[];

  isDefeated: boolean;
  dyingState: string;
  isVisible: boolean;
  controlledBy: "pc" | "ai" | "dm";

  positionX: number | null;
  positionY: number | null;

  recklessAttackActive: boolean;
  readiedAction: unknown | null;

  legendaryPointsAvailable: number | null;
  legendaryPointsMax: number | null;


  transformationState: {
    source: string;
    sourceCasterParticipantId?: string | null;
    enteredAtRound: number;
    durationRoundsTotal: number | null;
    durationRoundsRemaining: number | null;
    form: {
      monsterSlug: string | null;
      formName: string;
      displayName: string;
      size: string;
      ac: number;
      maxHp: number;
      currentHp: number;
      speed: Record<string, number | undefined>;
    };
    revertTriggers: {
      hpZero: boolean;
      concentrationBroken: boolean;
      durationEnd: boolean;
      playerDismiss: boolean;
    };
  } | null;
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
  tileEffects: EnrichedTileEffectResponse[];

  createdAt: string;
  updatedAt: string;
}

export interface EnrichedTileEffectResponse {
  id: string;
  encounterId: string;
  sourceSpellSlug: string;
  sourceParticipantId: string | null;
  effectKind: string | null;
  shapeKind: "sphere" | "cube" | "cylinder" | "line" | "cone";
  originCell: {
    x: number;
    y: number;
    direction?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | null;
    end?: { x: number; y: number } | null;
  };
  radiusCells: number;
  durationRoundsRemaining: number | null;
  saveDc: number | null;
  saveAbility: string | null;
  isDifficultTerrain: boolean;
  speedMultiplier: number | null;
  sourceConcentration: boolean;
  narrativeDescriptor: string | null;
}


function mapParticipant(
  p: EncounterParticipantEntity,
): EnrichedParticipantResponse {
  const pAny = p as any;


  let controlledBy: "pc" | "ai" | "dm" = p.controlledBy;
  if ((controlledBy as string) === "human") controlledBy = "pc";

  return {
    id: p.id,
    encounterId: p.encounterId,
    type: p.type,
    characterId: p.characterId ?? null,
    ownerUserId:
      typeof pAny.ownerUserId === "string" ? pAny.ownerUserId : null,
    monsterId: p.monsterId ?? null,
    linkedCasterParticipantId: p.linkedCasterParticipantId ?? null,
    displayName: p.displayName,
    faction: p.faction,


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


    dodging: p.dodgingUntilTurnOfParticipantId != null,
    hasDashed: p.hasDashed ?? false,
    hasDisengaged: p.hasDisengaged ?? false,



    hasInspiration: pAny.hasInspiration,
    inspirationArmed: p.inspirationArmed ?? false,
    helping: p.helpingAllyParticipantId != null,
    helpingAlly: p.helpingAllyParticipantId ?? null,
    helpingAgainst: p.helpingTargetParticipantId ?? null,


    concentration:
      p.isConcentrating && p.concentratingOn
        ? {
            spellSlug: p.concentratingOn,
            saveDc: p.concentrationSaveDc ?? 10,
            roundsRemaining: p.concentrationRoundsRemaining ?? null,
          }
        : null,

    grappledBy: p.grappledByParticipantId ?? null,


    spellSlots: pAny.spellSlots ?? [],

    effectInstances: p.effectInstances ?? [],
    appliedEffects: p.appliedEffects ?? [],
    conditionInstances: p.conditionInstances ?? [],
    conditions: p.conditions ?? [],

    isDefeated: p.isDefeated ?? false,
    dyingState: p.dyingState ?? "none",
    isVisible: p.isVisible ?? true,
    controlledBy,

    positionX: p.positionX ?? null,
    positionY: p.positionY ?? null,

    recklessAttackActive: p.recklessAttackActive ?? false,
    readiedAction: p.readiedAction ?? null,

    legendaryPointsAvailable: p.legendaryPointsAvailable ?? null,
    legendaryPointsMax: p.legendaryPointsMax ?? null,

    transformationState: p.transformationState
      ? {
          source: p.transformationState.source,
          sourceCasterParticipantId:
            p.transformationState.sourceCasterParticipantId ?? null,
          enteredAtRound: p.transformationState.enteredAtRound,
          durationRoundsTotal: p.transformationState.durationRoundsTotal,
          durationRoundsRemaining:
            p.transformationState.durationRoundsRemaining,
          form: {
            monsterSlug: p.transformationState.form.monsterSlug,
            formName: p.transformationState.form.formName,
            displayName: p.transformationState.form.displayName,
            size: p.transformationState.form.size,
            ac: p.transformationState.form.ac,
            maxHp: p.transformationState.form.maxHp,
            currentHp: p.transformationState.form.currentHp,
            speed: p.transformationState.form.speed,
          },
          revertTriggers: p.transformationState.revertTriggers,
        }
      : null,
  };
}


export function toEnrichedEncounterResponse(
  encounter: EncounterEntity,
  opts?: { tileEffects?: EnrichedTileEffectResponse[] },
): EnrichedEncounterResponse {
  const isActive = encounter.status !== "preparing";
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
    tileEffects: opts?.tileEffects ?? [],

    createdAt:
      encounter.createdAt instanceof Date
        ? encounter.createdAt.toISOString()
        : String(encounter.createdAt ?? ""),
    updatedAt:
      encounter.updatedAt instanceof Date
        ? encounter.updatedAt.toISOString()
        : String(encounter.updatedAt ?? ""),
  };
}
