import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import {
  resolveSlots,
  resolveSlotsForRankedCandidates,
} from "../domain/opening-slot-resolver";
import type { OpeningArchetype } from "../domain/opening-archetype.types";

const failing: OpeningArchetype = {
  key: "witness",
  displayName: "Witness",
  promptShape: "{{pc.name}} vê {{npc.witness.name}}.",
  requiredSlots: ["pc.name", "npc.witness.name"],
  optionalSlots: [],
  bannedPhrases: [],
  requiredVoiceProfiles: [],
  compatiblePcTags: [],
  incompatiblePcTags: [],
  emotionalArc: "rise",
  weightDefault: 1,
  fewShotExample: null,
  isActive: true,
  since: "037",
};

const fallback: OpeningArchetype = {
  ...failing,
  key: "fallback",
  requiredSlots: ["pc.name"],
  promptShape: "{{pc.name}} age.",
};

describe("resolveSlots", () => {
  it("returns COLD_OPEN_SLOT_RESOLUTION_FAILED when required slot has no candidate", () => {
    const result = resolveSlots(failing, {
      pc: { name: "Maguin" },
      npcs: [],
      locations: [],
      activeQuest: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.COLD_OPEN_SLOT_RESOLUTION_FAILED);
      expect(result.missingSlots).toEqual(["npc.witness.name"]);
    }
  });

  it("skips unresolved ranked candidates and returns the next resolvable one", () => {
    const result = resolveSlotsForRankedCandidates([failing, fallback], {
      pc: { name: "Maguin" },
      npcs: [],
      locations: [],
      activeQuest: null,
    });

    expect(result?.archetype.key).toBe("fallback");
    expect(result?.slots["pc.name"]).toBe("Maguin");
  });
});
