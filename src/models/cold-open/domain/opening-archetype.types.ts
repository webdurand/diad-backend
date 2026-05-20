export type ColdOpenVoiceProfile =
  | "heroic-high-fantasy"
  | "grim-low-fantasy"
  | "investigativo-misterioso"
  | "comico-pulp";

export type ColdOpenEmotionalArc =
  | "rise"
  | "fall"
  | "cinderella"
  | "man-in-hole"
  | "icarus"
  | "oedipus"
  | "return";

export interface OpeningArchetype {
  readonly key: string;
  readonly displayName: string;
  readonly promptShape: string;
  readonly requiredSlots: readonly string[];
  readonly optionalSlots: readonly string[];
  readonly bannedPhrases: readonly string[];
  readonly requiredVoiceProfiles: readonly ColdOpenVoiceProfile[];
  readonly compatiblePcTags: readonly string[];
  readonly incompatiblePcTags: readonly string[];
  readonly emotionalArc: ColdOpenEmotionalArc;
  readonly weightDefault: number;
  readonly fewShotExample: string | null;
  readonly isActive: boolean;
  readonly since: string;
  readonly opensInDialogue: boolean;
  readonly initialFocalNpcSlot: string | null;
}

export interface ColdOpenHookSnapshot {
  readonly archetypeKey: string;
  readonly seed: string;
  readonly slots: Readonly<Record<string, string>>;
  readonly generatedAt: string;
  readonly openingLineDraft: string | null;
  readonly initialFocalNpcId?: string | null;
  readonly initialFocalNpcSlot?: string | null;
  readonly scoringTrace: {
    readonly candidates: ReadonlyArray<{
      readonly key: string;
      readonly score: number;
      readonly rejectedReason: string | null;
    }>;
    readonly selected: string;
    readonly pcTags: readonly string[];
    readonly voiceProfile: string;
    readonly antiRepeatRejected: readonly string[];
  };
}

export interface SlotResolutionContext {
  pc: {
    name?: string | null;
    race?: string | null;
    class?: string | null;
  };
  npcs: Array<{
    id?: string | null;
    name?: string | null;
    title?: string | null;
    race?: string | null;
    description?: string | null;
    motivation?: string | null;
  }>;
  locations: Array<{
    name?: string | null;
    type?: string | null;
    atmosphere?: string | null;
    description?: string | null;
  }>;
  activeQuest: {
    id?: string;
    name?: string | null;
    activeObjective?: string | null;
  } | null;
  weather?: string | null;
}
