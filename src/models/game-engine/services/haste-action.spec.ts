import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import {
  canUseHasteForGenericAction,
  consumeHasteAction,
  hasAvailableHasteAction,
  hasHasteDexSaveAdvantage,
  resetHasteAction,
} from "./haste-action";

function participant(usedThisTurn = false): EncounterParticipantEntity {
  return {
    effectInstances: [
      {
        id: "haste-extra",
        kind: "extra_action",
        sourceSpellSlug: "haste-phb",
        sourceCasterParticipantId: "caster",
        payload: { amount: 1, usedThisTurn },
        expiresAt: { kind: "concentration" },
        requiresConcentration: true,
        appliedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  } as EncounterParticipantEntity;
}

describe("Haste action rules", () => {
  it("offers, consumes and refreshes the once-per-turn action", () => {
    const target = participant();
    expect(hasAvailableHasteAction(target)).toBe(true);
    expect(consumeHasteAction(target)).toBe(true);
    expect(hasAvailableHasteAction(target)).toBe(false);
    expect(consumeHasteAction(target)).toBe(false);
    expect(resetHasteAction(target)).toBe(true);
    expect(hasAvailableHasteAction(target)).toBe(true);
  });

  it("does not expose a ghost action when Haste is absent", () => {
    expect(
      hasAvailableHasteAction({
        effectInstances: [],
      } as EncounterParticipantEntity),
    ).toBe(false);
  });

  it("allows only the RAW generic action subset", () => {
    expect(canUseHasteForGenericAction("dash")).toBe(true);
    expect(canUseHasteForGenericAction("disengage")).toBe(true);
    expect(canUseHasteForGenericAction("hide")).toBe(true);
    expect(canUseHasteForGenericAction("use-object")).toBe(true);
    expect(canUseHasteForGenericAction("dodge")).toBe(false);
    expect(canUseHasteForGenericAction("search")).toBe(false);
  });

  it("grants advantage only to Dexterity saves", () => {
    const target = participant();
    expect(hasHasteDexSaveAdvantage(target, "dex")).toBe(true);
    expect(hasHasteDexSaveAdvantage(target, "wis")).toBe(false);
  });
});
