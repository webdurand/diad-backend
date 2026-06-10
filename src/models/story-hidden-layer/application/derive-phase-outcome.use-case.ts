import {
  countMarkedXpTriggers,
  normalizeXpTriggerState,
  type OutcomeTier,
  type XpTriggerState,
} from "../domain/hidden-layer.types";

export class DerivePhaseOutcomeUseCase {
  execute(input: XpTriggerState): OutcomeTier {
    const marked = countMarkedXpTriggers(normalizeXpTriggerState(input));
    if (marked >= 4) return "TRIUMPH";
    if (marked === 3) return "BITTERSWEET";
    if (marked === 2) return "COSTLY";
    return "FAILURE";
  }
}
