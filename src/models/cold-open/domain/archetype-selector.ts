import { createHash } from "crypto";
import type {
  ColdOpenVoiceProfile,
  OpeningArchetype,
} from "./opening-archetype.types";

export interface ArchetypeSelectionInput {
  archetypes: OpeningArchetype[];
  seed: string;
  pcTags: string[];
  voiceProfile: string;
  recentArchetypeKeys: string[];
  storyTags: string[];
}

const VALID_VOICE_PROFILES: ReadonlySet<string> = new Set<ColdOpenVoiceProfile>([
  "heroic-high-fantasy",
  "grim-low-fantasy",
  "investigativo-misterioso",
  "comico-pulp",
]);

function isColdOpenVoiceProfile(value: string): value is ColdOpenVoiceProfile {
  return VALID_VOICE_PROFILES.has(value);
}

export interface ScoredArchetype {
  archetype: OpeningArchetype;
  score: number;
  rejectedReason: string | null;
}

export interface ArchetypeSelectionResult {
  selected: OpeningArchetype;
  ranked: ScoredArchetype[];
  antiRepeatRejected: string[];
}

function stableJitter(seed: string, key: string): number {
  const hex = createHash("sha256").update(`${seed}:${key}`).digest("hex").slice(0, 8);
  return parseInt(hex, 16) / 0xffffffff;
}

function hasOverlap(left: readonly string[], right: Set<string>): boolean {
  return left.some((tag) => right.has(tag));
}

function pickSeededWeighted(
  candidates: ScoredArchetype[],
  seed: string,
): OpeningArchetype | null {
  if (candidates.length === 0) return null;

  const weights = candidates.map((item) => Math.max(0.1, item.score));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = stableJitter(seed, "selection") * total;

  for (let i = 0; i < candidates.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return candidates[i].archetype;
  }

  return candidates[candidates.length - 1].archetype;
}

function scoreArchetype(
  archetype: OpeningArchetype,
  input: ArchetypeSelectionInput,
): ScoredArchetype {
  if (!archetype.isActive) {
    return { archetype, score: Number.NEGATIVE_INFINITY, rejectedReason: "inactive" };
  }
  if (
    archetype.requiredVoiceProfiles.length > 0 &&
    (!isColdOpenVoiceProfile(input.voiceProfile) ||
      !archetype.requiredVoiceProfiles.includes(input.voiceProfile))
  ) {
    return {
      archetype,
      score: Number.NEGATIVE_INFINITY,
      rejectedReason: "voice_profile_mismatch",
    };
  }

  const pcTagSet = new Set(input.pcTags);
  if (hasOverlap(archetype.incompatiblePcTags, pcTagSet)) {
    return {
      archetype,
      score: Number.NEGATIVE_INFINITY,
      rejectedReason: "incompatible_pc_tag",
    };
  }

  const storyTagSet = new Set(input.storyTags);
  const tagOverlap = archetype.compatiblePcTags.filter((tag) => pcTagSet.has(tag)).length;
  const storyBonus = archetype.compatiblePcTags.filter((tag) => storyTagSet.has(tag)).length;
  const recencyPenalty = input.recentArchetypeKeys.includes(archetype.key) ? 3 : 0;
  const score =
    archetype.weightDefault +
    tagOverlap * 1.5 +
    storyBonus * 0.4 +
    stableJitter(input.seed, archetype.key) * 0.5 -
    recencyPenalty;

  return { archetype, score, rejectedReason: null };
}

export function rankArchetypes(input: ArchetypeSelectionInput): ScoredArchetype[] {
  return [...input.archetypes]
    .map((archetype) => scoreArchetype(archetype, input))
    .sort((a, b) => b.score - a.score || a.archetype.key.localeCompare(b.archetype.key));
}

export function selectArchetype(input: ArchetypeSelectionInput): ArchetypeSelectionResult {
  const ranked = rankArchetypes(input);
  const eligible = ranked.filter((item) => item.rejectedReason === null);
  const recentSet = new Set(input.recentArchetypeKeys.slice(0, 3));
  const nonRecent = eligible.filter((item) => !recentSet.has(item.archetype.key));
  const selected =
    pickSeededWeighted(nonRecent, input.seed) ??
    pickSeededWeighted(eligible, input.seed);

  if (selected) {
    return {
      selected,
      ranked,
      antiRepeatRejected: eligible
        .filter((item) => recentSet.has(item.archetype.key))
        .map((item) => item.archetype.key),
    };
  }

  const fallback = input.archetypes.find((item) => item.key === "in_medias_res");
  if (!fallback) {
    throw new Error("COLD_OPEN_NO_ARCHETYPE_MATCH");
  }
  return {
    selected: fallback,
    ranked,
    antiRepeatRejected: [],
  };
}
