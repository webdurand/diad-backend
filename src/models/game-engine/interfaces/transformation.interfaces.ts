


export type MonsterActionLike = Record<string, unknown>;

export type TransformationSource =
  | "wild-shape"
  | "polymorph-spell"
  | "true-polymorph-spell"
  | "shapechange-spell"
  | "alter-self-spell"
  | "form-of-dread"
  | "draconic-transformation";

export interface TransformationForm {

  monsterSlug: string | null;

  formName: string;

  displayName: string;
  size: string;
  ac: number;
  maxHp: number;
  currentHp: number;
  tempHp: number;
  speed: {
    walk: number;
    fly?: number;
    swim?: number;
    climb?: number;
    burrow?: number;
  };
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  actions: MonsterActionLike[];
  senses?: Record<string, unknown>;
  challengeRating?: number;
}

export interface TransformationOriginalSnapshot {

  maxHp: number;
  currentHp: number;
  tempHp: number;

  displayName: string;
}

export interface TransformationState {
  source: TransformationSource;
  enteredAtRound: number;

  sourceCasterParticipantId?: string | null;

  durationRoundsTotal: number | null;
  durationRoundsRemaining: number | null;

  original: TransformationOriginalSnapshot;
  form: TransformationForm;


  retainedAbilities: Array<
    "speech" | "mental-stats" | "class-features" | "spellcasting"
  >;


  equipmentHandling: "merge" | "drop" | "keep";


  revertTriggers: {
    hpZero: boolean;
    concentrationBroken: boolean;
    durationEnd: boolean;
    playerDismiss: boolean;
  };
}

export type TransformationRevertReason =
  | "player-dismiss"
  | "hp-zero"
  | "duration-end"
  | "concentration-broken"
  | "caster-death";
