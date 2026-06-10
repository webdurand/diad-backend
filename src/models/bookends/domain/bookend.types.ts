import type { EventAudience } from "src/common/event-bus/event-envelope.types";
import type {
  DiegeticRitualKey,
  OutcomeTier,
  XpTriggerState,
} from "src/models/story-hidden-layer/domain/hidden-layer.types";

export type BookendKind = "outro" | "intro" | "previously_on";

export interface BookendSampling {
  temperature: number;
  topP: number;
  maxTokens: number;
}

export interface BookendPayload {
  kind: BookendKind;
  narrativeBeat: string;
  sensoryAnchor: string;
  openThreads: string[];
  npcsReferenceable: string[];
  lengthHint?: "short" | "medium";
  archetypeKey: string;
  voiceProfile?: string;
  bannedPhrases?: string[];
  outcomeTier?: OutcomeTier | null;
  closingSeedFocus?: string | null;
  closingSeedCrossroad?: string | null;
  diegeticRitualResolved?: DiegeticRitualKey | null;
  hiddenSecretSeed?: string | null;
  xpTriggerState?: XpTriggerState | null;
  twoBeatRequired?: boolean;
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

export interface BookendArtifactMetadata {
  model: string;
  sampling: BookendSampling;
  latencyMs: number;
  plannerCacheHit?: boolean;
  writerCacheHit?: boolean;
  plannerPayloadSnapshot?: BookendPayload;
  toolUseRetries?: number;
  continuityJudge?: {
    closingAntiSlopPass?: boolean;
    bookendStateConsistency?: boolean;
    closingEssencePass?: boolean;
    twoBeatStructurePass?: boolean;
  };
  [key: string]: unknown;
}

export interface GeneratedBookendMetadata {
  model: string;
  sampling?: BookendSampling;
  latencyMs?: number;
  plannerCacheHit?: boolean;
  writerCacheHit?: boolean;
  continuityJudge?: BookendArtifactMetadata["continuityJudge"];
  [key: string]: unknown;
}

export interface BookendArtifactDraft {
  gameSessionId: string;
  phaseTransitionId?: string | null;
  kind: BookendKind;
  prose: string;
  npcsReferenced: string[];
  metadata: BookendArtifactMetadata;
  skippedByUser?: boolean;
}

export interface BookendArtifactRecord extends BookendArtifactDraft {
  id: string;
  skippedByUser: boolean;
  createdAt: Date;
}

export interface NpcStateSnapshot {
  npcsAliveAtEndOfPhase: string[];
  npcsDeadDuringPhase: string[];
}

export interface GeneratedBookendProse {
  text: string;
  npcsReferenced: string[];
  plannerPayload: BookendPayload;
  metadata: GeneratedBookendMetadata;
}

export const BOOKEND_AUDIENCES: EventAudience[] = [
  "Narrator",
  "Director",
  "HUD",
  "Archivist",
];

export const BOOKEND_READY_AUDIENCES: EventAudience[] = ["HUD", "Archivist"];

export const BOOKEND_SAMPLING: Record<BookendKind, BookendSampling> = {
  outro: { temperature: 0.6, topP: 0.9, maxTokens: 800 },
  intro: { temperature: 0.75, topP: 0.92, maxTokens: 800 },
  previously_on: { temperature: 0.7, topP: 0.9, maxTokens: 500 },
};

export function serializeBookendKind(kind: BookendKind): string {
  if (kind === "previously_on") return "previously_on";
  return kind;
}
