import type { ReadiedAction, TurnActionBlock } from "./combat.interfaces";


export interface EncounterSnapshot {
  encounterId: string;
  round: number;
  currentTurnParticipantId: string;
  participants: SnapshotParticipant[];
  map?: EncounterMapSnapshot;

  tileEffects?: TileEffectSnapshot[];
  generatedAt: string;
}


export interface TileEffectSnapshot {
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
  damageDice: string;
  damageType: string;
  durationRoundsRemaining: number | null;
  saveDc: number | null;
  saveAbility: string | null;
  isDifficultTerrain: boolean;
  speedMultiplier: number | null;
  sourceConcentration: boolean;
  auraFollowsCaster: boolean;
  narrativeDescriptor: string | null;

  tactical: unknown | null;

  cells: Array<{ x: number; y: number }>;
  affectingParticipantIds: string[];
}

export interface SnapshotParticipant {
  id: string;
  type: "pc" | "monster" | "npc";
  creatureType?: string | null;
  isCompanion?: boolean;
  companionTemplateId?: string | null;
  faction: "ally" | "enemy" | "neutral";
  displayName: string;
  controlledBy: "pc" | "ai" | "dm";
  position: { x: number; y: number };

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

  isConcentrating: boolean;
  concentratingOn: string | null;



  statblockRef?: {
    monsterSlug: string;
    actions?: unknown[];
    intelligence?: number;
    wisdom?: number;

    speed?: number;
    multiattack?: {
      sequence: Array<{ actionName: string; count: number }>;
      description?: string;
      recharge?: string;
    } | null;
    spellcasting?: {
      type?: string;
      ability?: string;
      saveDc?: number;
      attackBonus?: number;
      knownSpells?: Array<{ slug: string; level: number; name?: string }>;
      slotsByLevel?: Array<{ level: number; total: number; remaining: number }>;
      dailyUses?: Array<{
        name: string;
        usesRemaining: number;
        usesMax: number;
      }>;
    } | null;
    bonusActions?: Array<{ name: string; description?: string }>;
    reactions?: Array<{ name: string; description?: string; trigger?: string }>;
    legendaryActions?: Array<{
      name: string;
      cost: 1 | 2 | 3;
      description?: string;
    }>;
    legendaryActionPointsRemaining?: number;
    legendaryActionPointsMax?: number;
    lairActions?: Array<{ name: string; description?: string }>;
  };
  availableActions: TurnActionBlock[];

  distances: Record<string, number>;

  canSee: Record<string, boolean>;
}

export interface EncounterMapSnapshot {
  width: number;
  height: number;

  tiles?: unknown;
}
