import type { PhaseEmotionalArc } from "src/entities/phase.entity";
import { DIEGETIC_RITUAL_CATALOG } from "../domain/diegetic-ritual-catalog";
import type { DiegeticRitualKey, OutcomeTier } from "../domain/hidden-layer.types";

export interface ResolveDiegeticRitualInput {
  outcomeTier: OutcomeTier;
  emotionalArc: PhaseEmotionalArc;
  preferredHint?: DiegeticRitualKey | null;
}

const RITUAL_PRIORITY: readonly DiegeticRitualKey[] = [
  "festival",
  "funeral",
  "vigil",
  "oath",
  "return",
  "departure",
  "toast",
] as const;

export class ResolveDiegeticRitualUseCase {
  execute(input: ResolveDiegeticRitualInput): DiegeticRitualKey {
    const compatible = DIEGETIC_RITUAL_CATALOG.filter(
      (ritual) =>
        ritual.isActive &&
        ritual.compatibleOutcomeTiers.includes(input.outcomeTier) &&
        ritual.compatibleEmotionalArcs.includes(input.emotionalArc),
    );

    if (
      input.preferredHint &&
      compatible.some((ritual) => ritual.key === input.preferredHint)
    ) {
      return input.preferredHint;
    }

    const byPriority = RITUAL_PRIORITY.find((key) =>
      compatible.some((ritual) => ritual.key === key),
    );
    return byPriority ?? fallbackForOutcome(input.outcomeTier);
  }
}

function fallbackForOutcome(outcomeTier: OutcomeTier): DiegeticRitualKey {
  if (outcomeTier === "TRIUMPH") return "festival";
  if (outcomeTier === "FAILURE") return "funeral";
  if (outcomeTier === "COSTLY") return "vigil";
  return "oath";
}
