import type { OutcomeTier } from "src/models/story-hidden-layer/domain/hidden-layer.types";

export const MAX_IDENTITY_TAGS = 5;
export const MAX_IDENTITY_HISTORY = 50;
export const MAX_CHRONICLE_SUMMARY_ENTRIES = 5;

export type ChronicleTier = "active" | "diary" | "forgotten";
export type DowntimeArchetype = "expected" | "altered" | "interrupt";
export type ChaosFactorCause =
  | "phase_outcome"
  | "admin_override"
  | "downtime_event";

export interface IdentityTagDelta {
  added: string[];
  removed: string[];
  appliedAt: string;
  phaseTransitionId: string;
  rationale?: string;
}

export interface PCIdentityState {
  currentTags: string[];
  history: IdentityTagDelta[];
}

export interface ChronicleMemoryEntry {
  id: string;
  campaignId: string;
  sessionId?: string | null;
  phaseId?: string | null;
  phaseIndex?: number | null;
  title: string;
  content: string;
  tier: ChronicleTier;
  legacyTags: string[];
  tierLocked: boolean;
  significance: number;
  tieredAt?: Date | null;
  summarizerMetadata?: Record<string, unknown> | null;
}

export interface ChronicleSummary {
  entryId: string;
  content: string;
  legacyTags: string[];
}

export interface ChronicleSummarizeResult {
  summaries: ChronicleSummary[];
  metadata: {
    model: string;
    latencyMs: number;
    [key: string]: unknown;
  };
}

export interface DowntimeTurnDraft {
  gameSessionId: string;
  phaseTransitionId: string;
  turnIndex: number;
  archetypeChosen: DowntimeArchetype;
  chaosFactor: number;
  narrativeText: string;
  status: "ready" | "failed";
  metadata: Record<string, unknown>;
}

export function chaosDeltaForOutcome(outcomeTier: OutcomeTier): -1 | 0 | 1 {
  if (outcomeTier === "TRIUMPH") return -1;
  if (outcomeTier === "BITTERSWEET") return 0;
  return 1;
}

export function clampChaosFactor(value: number): number {
  return Math.max(1, Math.min(9, value));
}

export function downtimeArchetypeForChaosFactor(
  chaosFactor: number,
): DowntimeArchetype {
  if (chaosFactor <= 3) return "expected";
  if (chaosFactor <= 6) return "altered";
  return "interrupt";
}

export function downtimeTurnsForArchetype(
  archetype: DowntimeArchetype,
): number {
  if (archetype === "expected") return 1;
  if (archetype === "altered") return 2;
  return 3;
}
