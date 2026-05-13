

export type SummonSource =
  | "summon-beast-spell"
  | "summon-fey-spell"
  | "summon-elemental-spell"
  | "summon-undead-spell"
  | "summon-aberration-spell"
  | "summon-celestial-spell"
  | "summon-construct-spell"
  | "summon-dragon-spell"
  | "conjure-animals-spell"
  | "conjure-woodland-beings-spell"
  | "conjure-minor-elementals-spell"
  | "find-familiar-spell"
  | "find-steed-spell"
  | "spiritual-weapon-spell"
  | "flaming-sphere-spell"
  | "animate-dead-spell"
  | "beast-master-companion"
  | "echo-knight-echo";

export type SummonControlMode =

  | "shared-turn"

  | "own-initiative"

  | "ai-controlled";

export type SummonConcentrationBreakBehavior = "dismiss" | "turn-hostile";

export interface SummonSpawnDto {

  casterParticipantId: string;

  monsterSlug: string;

  position?: { x: number; y: number };

  displayName?: string;

  faction?: "ally" | "enemy" | "neutral";
  controlMode?: SummonControlMode;

  durationRoundsTotal?: number | null;

  concentrationLinked?: boolean;

  concentrationBreakBehavior?: SummonConcentrationBreakBehavior;

  source: SummonSource;
}
