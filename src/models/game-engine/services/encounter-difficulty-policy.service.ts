import { Injectable } from "@nestjs/common";
import type { Difficulty } from "./monster-selector.service";

export type CampaignDifficulty = "heroic" | "standard" | "gritty";

export interface EncounterDifficultyDecision {
  campaignDifficulty: CampaignDifficulty;
  requestedDifficulty: Difficulty;
  effectiveDifficulty: Difficulty;
  adjusted: boolean;
  reason: string;
}

const ORDER: readonly Difficulty[] = ["low", "moderate", "high"];

@Injectable()
export class EncounterDifficultyPolicyService {
  resolve(
    campaignDifficulty: string | null | undefined,
    requestedDifficulty: Difficulty,
  ): EncounterDifficultyDecision {
    const normalized = this.normalizeCampaignDifficulty(campaignDifficulty);
    const requestedIndex = ORDER.indexOf(requestedDifficulty);
    const shift = normalized === "heroic" ? -1 : normalized === "gritty" ? 1 : 0;
    const effectiveIndex = Math.max(
      0,
      Math.min(ORDER.length - 1, requestedIndex + shift),
    );
    const effectiveDifficulty = ORDER[effectiveIndex];

    return {
      campaignDifficulty: normalized,
      requestedDifficulty,
      effectiveDifficulty,
      adjusted: effectiveDifficulty !== requestedDifficulty,
      reason:
        `campaign_difficulty:${normalized};` +
        `requested:${requestedDifficulty};effective:${effectiveDifficulty}`,
    };
  }

  private normalizeCampaignDifficulty(
    difficulty: string | null | undefined,
  ): CampaignDifficulty {
    if (difficulty === "heroic" || difficulty === "gritty") {
      return difficulty;
    }
    return "standard";
  }
}
