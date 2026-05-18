import type { PhaseEmotionalArc } from "src/entities/phase.entity";

export const XP_TRIGGER_KINDS = [
  "objective_met",
  "belief_expressed",
  "flaw_struggled",
  "bond_progressed",
  "secret_revealed",
] as const;

export type XpTriggerKind = (typeof XP_TRIGGER_KINDS)[number];
export type XpTriggerState = Record<XpTriggerKind, boolean>;

export type OutcomeTier = "TRIUMPH" | "BITTERSWEET" | "COSTLY" | "FAILURE";

export const OUTCOME_TIERS: readonly OutcomeTier[] = [
  "TRIUMPH",
  "BITTERSWEET",
  "COSTLY",
  "FAILURE",
] as const;

export const DIEGETIC_RITUAL_KEYS = [
  "festival",
  "funeral",
  "oath",
  "return",
  "departure",
  "toast",
  "vigil",
] as const;

export type DiegeticRitualKey = (typeof DIEGETIC_RITUAL_KEYS)[number];

export interface ClosingSeedSnapshot {
  focus: string;
  crossroad: string;
  diegeticRitualHint: DiegeticRitualKey;
  biasedOutcomeTier: OutcomeTier;
  hiddenSecretSeed?: string | null;
  commitedAtPhaseIndex: number;
  generatedAt: string;
  plannerMetadata?: {
    model?: string;
    temperature?: number;
    latencyMs?: number;
    cacheHit?: boolean;
  };
}

export interface TwoBeatAudit {
  required: boolean;
  passed: boolean;
  retries: number;
  fallbackUsed: boolean;
}

export interface BookendHiddenLayerContext {
  outcomeTier?: OutcomeTier | null;
  closingSeed?: ClosingSeedSnapshot | null;
  diegeticRitualResolved?: DiegeticRitualKey | null;
  xpTriggerState?: XpTriggerState | null;
  twoBeat?: TwoBeatAudit | null;
  currentIdentityTags?: string[];
  chronicleDiary?: Array<{
    id: string;
    title: string;
    summary: string;
    legacyTags: string[];
  }>;
  bondResolved?: string | null;
  bondEmerging?: Record<string, unknown> | null;
}

export interface DiegeticRitualDefinition {
  key: DiegeticRitualKey;
  displayName: string;
  defaultTone: string;
  compatibleEmotionalArcs: PhaseEmotionalArc[];
  compatibleOutcomeTiers: OutcomeTier[];
  narrativeSeedTemplate: string;
  bannedPhrasesContextual: string[];
  isActive: boolean;
  since: "039";
}

export const DEFAULT_XP_TRIGGER_STATE: XpTriggerState = {
  objective_met: false,
  belief_expressed: false,
  flaw_struggled: false,
  bond_progressed: false,
  secret_revealed: false,
};

export function createEmptyXpTriggerState(): XpTriggerState {
  return { ...DEFAULT_XP_TRIGGER_STATE };
}

export function normalizeXpTriggerState(value: unknown): XpTriggerState {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<Record<XpTriggerKind, unknown>>)
      : {};
  return XP_TRIGGER_KINDS.reduce<XpTriggerState>((state, kind) => {
    state[kind] = raw[kind] === true;
    return state;
  }, createEmptyXpTriggerState());
}

export function countMarkedXpTriggers(state: XpTriggerState): number {
  return XP_TRIGGER_KINDS.filter((kind) => state[kind]).length;
}
